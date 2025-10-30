import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Trash2, Play, Pause, Plus, Clock, DollarSign, Download } from 'lucide-react';
import { worksApi, sessionsApi, timelineApi } from '../services/api';
import { useTimer, formatDuration } from '../hooks/useTimer';
import WorkForm from '../components/WorkForm';
import TimelineForm from '../components/TimelineForm';
import VisualTimeline from '../components/VisualTimeline';
import QuickNoteInput from '../components/QuickNoteInput';
import type { TimeSession } from '../types';

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workId = parseInt(id!, 10);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);

  const { data: work } = useQuery({
    queryKey: ['works', workId],
    queryFn: async () => {
      const response = await worksApi.getById(workId);
      return response.data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ['sessions', 'work', workId],
    queryFn: async () => {
      const response = await sessionsApi.getByWorkId(workId);
      return response.data;
    },
  });

  const runningSession = sessions.find((s: TimeSession) => s.is_running);

  // Auto-select running session when it starts, or most recent session
  useEffect(() => {
    if (runningSession && selectedSessionId !== runningSession.id) {
      setSelectedSessionId(runningSession.id);
    } else if (!selectedSessionId && sessions.length > 0 && !runningSession) {
      // Select most recent session if no session is running
      setSelectedSessionId(sessions[0].id);
    }
  }, [runningSession, selectedSessionId, sessions]);

  // Determine which session to view
  const viewingSession = selectedSessionId
    ? sessions.find((s: TimeSession) => s.id === selectedSessionId)
    : null;

  const { data: timelineEntries = [] } = useQuery({
    queryKey: ['timeline', 'session', viewingSession?.id],
    queryFn: async () => {
      if (!viewingSession) return [];
      const response = await timelineApi.getBySessionId(viewingSession.id);
      return response.data;
    },
    enabled: !!viewingSession,
    refetchInterval: (viewingSession?.is_running) ? 3000 : false, // Auto-refresh when viewing running session
  });

  const { data: stats } = useQuery({
    queryKey: ['sessions', 'stats', workId],
    queryFn: async () => {
      const response = await sessionsApi.getStats(workId);
      return response.data;
    },
  });

  const elapsed = useTimer(runningSession || null);

  const startMutation = useMutation({
    mutationFn: () => sessionsApi.start(workId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (sessionId: number) => sessionsApi.stop(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => worksApi.delete(workId),
    onSuccess: () => {
      navigate('/dashboard');
    },
  });

  const handleStartTimer = () => {
    startMutation.mutate();
  };

  const handleStopTimer = () => {
    if (runningSession) {
      stopMutation.mutate(runningSession.id);
    }
  };

  const handleDelete = () => {
    if (window.confirm('Are you sure you want to delete this work? This action cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleExport = async (format: 'json' | 'markdown') => {
    try {
      // Gather all work data
      const exportData = {
        work: work,
        sessions: sessions,
        timeline: await Promise.all(
          sessions.map(async (session: TimeSession) => {
            const response = await timelineApi.getBySessionId(session.id);
            return {
              session_id: session.id,
              entries: response.data,
            };
          })
        ),
        stats: stats,
        exported_at: new Date().toISOString(),
      };

      let content: string;
      let filename: string;
      let mimeType: string;

      if (format === 'json') {
        content = JSON.stringify(exportData, null, 2);
        filename = `${work?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.json`;
        mimeType = 'application/json';
      } else {
        // Markdown format
        const totalHours = (stats?.totalDuration || 0) / (1000 * 60 * 60);
        const estimatedEarnings = work?.hourly_rate ? totalHours * work.hourly_rate : null;

        content = `# ${work?.title || 'Work Report'}

**Client:** ${work?.client_name || 'N/A'}
**Status:** ${work?.status || 'N/A'}
**Generated:** ${new Date().toLocaleString()}

---

## Summary

- **Total Time:** ${formatDuration(stats?.totalDuration || 0)} (${totalHours.toFixed(2)} hours)
- **Total Sessions:** ${sessions.length}
- **Hourly Rate:** ${work?.hourly_rate ? `$${work.hourly_rate}/hour` : 'N/A'}
${estimatedEarnings ? `- **Estimated Earnings:** $${estimatedEarnings.toFixed(2)}` : ''}

${work?.description ? `\n## Description\n\n${work.description}\n` : ''}

## Sessions & Timeline

${sessions.map((session: TimeSession, idx: number) => {
  const sessionTimeline = exportData.timeline.find(t => t.session_id === session.id)?.entries || [];
  const duration = session.duration_ms || 0;

  return `### Session ${idx + 1} ${session.is_running ? '(Running)' : ''}

**Start:** ${new Date(session.start_time).toLocaleString()}
${session.end_time ? `**End:** ${new Date(session.end_time).toLocaleString()}` : ''}
**Duration:** ${formatDuration(duration)}

${sessionTimeline.length > 0 ? `#### Timeline Entries

${sessionTimeline.map((entry: any) => `- **${new Date(entry.timestamp).toLocaleTimeString()}** ${entry.activity_type ? `[${entry.activity_type}]` : ''}: ${entry.label}`).join('\n')}` : '_No timeline entries for this session_'}

---
`;
}).join('\n')}

${work?.tags && work.tags.length > 0 ? `\n## Tags\n\n${work.tags.join(', ')}` : ''}
`;
        filename = `${work?.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${new Date().toISOString().split('T')[0]}.md`;
        mimeType = 'text/markdown';
      }

      // Create and download file
      const blob = new Blob([content], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const totalHours = stats ? stats.totalDuration / (1000 * 60 * 60) : 0;
  const estimatedEarnings = work?.hourly_rate ? totalHours * work.hourly_rate : null;

  if (!work) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-dark-bg flex flex-col overflow-hidden">
      <header className="bg-dark-surface border-b border-dark-border flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="flex space-x-2">
              <div className="relative group">
                <button className="btn btn-primary flex items-center space-x-2">
                  <Download size={16} />
                  <span>Export</span>
                </button>
                <div className="absolute right-0 mt-2 w-48 bg-dark-surface border border-dark-border rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <button
                    onClick={() => handleExport('json')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-hover rounded-t-lg"
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport('markdown')}
                    className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-hover rounded-b-lg"
                  >
                    Export as Markdown
                  </button>
                </div>
              </div>
              <button
                onClick={() => setShowEditForm(true)}
                className="btn btn-secondary flex items-center space-x-2"
              >
                <Edit size={16} />
                <span>Edit</span>
              </button>
              <button
                onClick={handleDelete}
                className="btn btn-danger flex items-center space-x-2"
              >
                <Trash2 size={16} />
                <span>Delete</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col overflow-hidden">
        <div className="mb-6 flex-shrink-0">
          <h1 className="text-3xl font-bold text-gray-100 mb-2">{work.title}</h1>
          {work.client_name && (
            <p className="text-gray-400">Client: {work.client_name}</p>
          )}
          {work.description && (
            <p className="text-gray-500 mt-2">{work.description}</p>
          )}
          {work.tags && work.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {work.tags.map((tag, i) => (
                <span key={i} className="text-sm bg-dark-border px-3 py-1 rounded text-gray-400">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 flex-shrink-0">
          <div className="card">
            <div className="flex items-center space-x-3 mb-2">
              <Clock className="text-blue-500" size={20} />
              <span className="text-sm text-gray-400">Total Time</span>
            </div>
            <p className="text-2xl font-bold text-gray-100">
              {formatDuration(stats?.totalDuration || 0)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {totalHours.toFixed(2)} hours
            </p>
          </div>

          {work.hourly_rate && (
            <div className="card">
              <div className="flex items-center space-x-3 mb-2">
                <DollarSign className="text-green-500" size={20} />
                <span className="text-sm text-gray-400">Estimated Earnings</span>
              </div>
              <p className="text-2xl font-bold text-gray-100">
                ${estimatedEarnings?.toFixed(2) || '0.00'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                ${work.hourly_rate}/hour
              </p>
            </div>
          )}

          <div className="card">
            <div className="flex items-center space-x-3 mb-2">
              <Play className="text-purple-500" size={20} />
              <span className="text-sm text-gray-400">Sessions</span>
            </div>
            <p className="text-2xl font-bold text-gray-100">{sessions.length}</p>
          </div>
        </div>

        <div className="card mb-6 flex-shrink-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-100">Timer</h2>
            {runningSession ? (
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-mono text-gray-100">
                  {formatDuration(elapsed)}
                </span>
                <button
                  onClick={handleStopTimer}
                  className="btn btn-danger flex items-center space-x-2"
                >
                  <Pause size={16} />
                  <span>Stop</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleStartTimer}
                disabled={startMutation.isPending}
                className="btn btn-primary flex items-center space-x-2"
              >
                <Play size={16} />
                <span>Start Timer</span>
              </button>
            )}
          </div>
        </div>

        {/* Visual Timeline Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
          {/* Main Timeline */}
          <div className="lg:col-span-2 card flex flex-col h-full min-h-0">
            <VisualTimeline
              entries={timelineEntries}
              session={viewingSession || null}
              isRunning={viewingSession?.is_running || false}
            />
          </div>

          {/* Sidebar */}
          <div className="space-y-6 h-full overflow-y-auto min-h-0">
            {/* Quick Note Input - Only for running sessions */}
            {runningSession && viewingSession?.id === runningSession.id && (
              <QuickNoteInput
                workId={workId}
                sessionId={runningSession.id}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['timeline'] });
                }}
              />
            )}

            {/* Alternative: Modal Form Button */}
            {runningSession && viewingSession?.id === runningSession.id && (
              <button
                onClick={() => setShowTimelineForm(true)}
                className="btn btn-secondary w-full flex items-center justify-center space-x-2"
              >
                <Plus size={16} />
                <span>Advanced Entry Form</span>
              </button>
            )}

            {/* Info when viewing past session */}
            {viewingSession && !viewingSession.is_running && (
              <div className="card bg-blue-900/20 border-blue-700">
                <p className="text-sm text-blue-300">
                  📜 Viewing past session from {new Date(viewingSession.start_time).toLocaleDateString()}
                </p>
                <p className="text-xs text-blue-400 mt-2">
                  Duration: {formatDuration(viewingSession.duration_ms || 0)}
                </p>
                {runningSession && (
                  <button
                    onClick={() => setSelectedSessionId(runningSession.id)}
                    className="btn btn-primary w-full mt-3 text-sm"
                  >
                    Switch to Running Session
                  </button>
                )}
              </div>
            )}

            {/* Session History */}
            <div className="card flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-gray-100 mb-3">Sessions History</h3>
              <div className="space-y-2 flex-1 overflow-y-auto">
                {sessions.slice(0, 10).map((session: TimeSession) => (
                  <button
                    key={session.id}
                    onClick={() => setSelectedSessionId(session.id)}
                    className={`w-full bg-dark-bg border rounded p-2 text-xs text-left transition-colors ${
                      selectedSessionId === session.id
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-dark-border hover:border-gray-600'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-400">
                          {new Date(session.start_time).toLocaleDateString()}
                        </p>
                        <p className="text-gray-500">
                          {new Date(session.start_time).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={`font-medium ${session.is_running ? 'text-green-500' : 'text-gray-400'}`}>
                        {session.is_running ? '🟢 Running' : formatDuration(session.duration_ms || 0)}
                      </span>
                    </div>
                  </button>
                ))}
                {sessions.length > 10 && (
                  <p className="text-xs text-gray-500 text-center pt-2">
                    +{sessions.length - 10} more sessions (use dropdown to view all)
                  </p>
                )}
                {sessions.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No sessions yet. Start a timer to begin!</p>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </main>

      {showEditForm && (
        <WorkForm
          work={work}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            queryClient.invalidateQueries({ queryKey: ['works', workId] });
          }}
        />
      )}

      {showTimelineForm && runningSession && (
        <TimelineForm
          workId={workId}
          sessionId={runningSession.id}
          onClose={() => setShowTimelineForm(false)}
          onSuccess={() => {
            setShowTimelineForm(false);
            queryClient.invalidateQueries({ queryKey: ['timeline'] });
          }}
        />
      )}
    </div>
  );
}
