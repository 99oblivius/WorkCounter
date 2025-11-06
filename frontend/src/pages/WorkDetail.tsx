import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Trash2, Play, Pause, Plus, Clock, DollarSign, Download, Share2, LogOut } from 'lucide-react';
import { worksApi, sessionsApi, timelineApi, authApi } from '../services/api';
import { workSharingApi } from '../services/adminApi';
import { useTimer, formatDuration } from '../hooks/useTimer';
import { useUploadWarning } from '../hooks/useUploadWarning';
import { useWorkPermissions } from '../hooks/useWorkPermissions';
import { useWorkStream } from '../hooks/useWorkStream';
import WorkForm from '../components/WorkForm';
import TimelineForm from '../components/TimelineForm';
import VisualTimeline from '../components/VisualTimeline';
import QuickNoteInput from '../components/QuickNoteInput';
import EditTimelineModal from '../components/EditTimelineModal';
import FileStorageSection from '../components/FileStorageSection';
import WorkSharingModal from '../components/WorkSharingModal';
import type { TimeSession, TimelineEntry } from '../types';

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workId = parseInt(id!, 10);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showTimelineForm, setShowTimelineForm] = useState(false);
  const [scrollToSessionId, setScrollToSessionId] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // Fetch work permissions for current user
  const { permissions, isLoading: permissionsLoading } = useWorkPermissions(workId);

  // Warn user before leaving page if uploads are in progress
  useUploadWarning();

  // SSE connection for real-time updates - replaces all polling
  const { initialData } = useWorkStream(workId);

  // User query (not work-specific, so keep separate)
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const response = await authApi.getMe();
      return response.data;
    },
  });

  // Get data from React Query cache (populated by SSE)
  const { data: work } = useQuery<any>({
    queryKey: ['works', workId],
    enabled: false, // Don't fetch - data comes from SSE
  });

  const { data: sessions = [] } = useQuery<TimeSession[]>({
    queryKey: ['sessions', 'work', workId],
    enabled: false, // Don't fetch - data comes from SSE
  });

  const { data: timelineEntries = [] } = useQuery<TimelineEntry[]>({
    queryKey: ['timeline', 'work', workId],
    enabled: false, // Don't fetch - data comes from SSE
  });

  const { data: stats } = useQuery<{ totalDuration: number }>({
    queryKey: ['sessions', 'stats', workId],
    enabled: false, // Don't fetch - data comes from SSE
  });

  const { data: sharesData, refetch: refetchShares } = useQuery<{ shares: any[] }>({
    queryKey: ['work-shares', workId],
    enabled: false, // Don't fetch - data comes from SSE
    queryFn: async () => {
      return await workSharingApi.getWorkShares(workId);
    },
  });

  const shares = sharesData?.shares || [];

  // Refetch shares when opening the modal
  useEffect(() => {
    if (showShareModal && permissions.isOwner) {
      refetchShares();
    }
  }, [showShareModal, permissions.isOwner, refetchShares]);
  const runningSession = sessions.find((s) => s.is_running);

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

  const leaveMutation = useMutation({
    mutationFn: () => workSharingApi.leaveSharedWork(workId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['works'] });
      navigate('/dashboard');
    },
  });

  const updateTimelineMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { label?: string; activityType?: string | null } }) =>
      timelineApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      setEditingEntry(null);
    },
  });

  const deleteTimelineMutation = useMutation({
    mutationFn: (id: number) => timelineApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (error: any) => {
      // Gracefully handle race conditions (entry already deleted)
      if (error.response?.status === 404) {
        console.log('[Delete] Timeline entry already deleted, refreshing UI');
        queryClient.invalidateQueries({ queryKey: ['timeline'] });
      } else {
        alert(error.response?.data?.error || 'Failed to delete timeline entry');
      }
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => sessionsApi.delete(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (error: any) => {
      // Gracefully handle race conditions (session already deleted)
      if (error.response?.status === 404) {
        console.log('[Delete] Session already deleted, refreshing UI');
        // Just refresh - SSE already removed it from cache
        queryClient.invalidateQueries({ queryKey: ['sessions'] });
      } else {
        alert(error.response?.data?.error || 'Failed to delete session');
      }
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

  const handleLeave = () => {
    if (window.confirm('Leave this shared work? You will no longer have access to it.')) {
      leaveMutation.mutate();
    }
  };

  const handleEditEntry = (entry: TimelineEntry) => {
    setEditingEntry(entry);
  };

  const handleSaveEntry = (data: { label?: string; activityType?: string | null }) => {
    if (editingEntry) {
      updateTimelineMutation.mutate({ id: editingEntry.id, data });
    }
  };

  const handleDeleteEntry = (entryId: number) => {
    deleteTimelineMutation.mutate(entryId);
  };

  const handleDeleteSession = (sessionId: number) => {
    if (window.confirm('Delete this session and all its notes? This action cannot be undone.')) {
      deleteSessionMutation.mutate(sessionId);
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
        // Add full image URLs to JSON export
        const exportWithFullUrls = {
          ...exportData,
          timeline: exportData.timeline.map(t => ({
            ...t,
            entries: t.entries.map((entry: any) => ({
              ...entry,
              image_urls: entry.image_urls?.map((key: string) =>
                `${import.meta.env.VITE_API_URL || window.location.origin}/api/timeline/images/${key}`
              ),
            })),
          })),
        };
        content = JSON.stringify(exportWithFullUrls, null, 2);
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

${sessionTimeline.map((entry: any) => {
  const timeStr = `- **${new Date(entry.timestamp).toLocaleTimeString()}** ${entry.activity_type ? `[${entry.activity_type}]` : ''}`;
  const labelStr = entry.label ? `: ${entry.label}` : '';
  const imagesStr = entry.image_urls && entry.image_urls.length > 0
    ? `\n  - **Attachments (${entry.image_urls.length}):**\n${entry.image_urls.map((key: string) => `    - ${import.meta.env.VITE_API_URL || window.location.origin}/api/timeline/images/${key}`).join('\n')}`
    : '';
  return `${timeStr}${labelStr}${imagesStr}`;
}).join('\n')}` : '_No timeline entries for this session_'}

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

  // Loading state for permissions only (fast, doesn't block UI)
  const isLoading = !initialData || permissionsLoading;

  return (
    <div className="h-screen bg-dark-bg flex flex-col overflow-hidden">
      <header className="bg-dark-surface border-b border-dark-border flex-shrink-0">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-secondary flex items-center space-x-2"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
            <div className="flex space-x-2">
              {/* Export - Available to all with view access */}
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

              {/* Leave - Sharee only */}
              {!permissions.isOwner && permissions.isShared && (
                <button
                  onClick={handleLeave}
                  disabled={leaveMutation.isPending}
                  className="btn btn-secondary flex items-center space-x-2"
                  title="Remove yourself from this shared work"
                >
                  <LogOut size={16} />
                  <span>Leave Shared Work</span>
                </button>
              )}

              {/* Share - Owner only */}
              {permissions.isOwner && (
                <button
                  onClick={() => setShowShareModal(true)}
                  className="btn btn-secondary flex items-center space-x-2"
                >
                  <Share2 size={16} />
                  <span>Share</span>
                </button>
              )}

              {/* Edit - Owner only */}
              {permissions.isOwner && (
                <button
                  onClick={() => setShowEditForm(true)}
                  className="btn btn-secondary flex items-center space-x-2"
                >
                  <Edit size={16} />
                  <span>Edit</span>
                </button>
              )}

              {/* Delete - Owner only */}
              {permissions.isOwner && (
                <button
                  onClick={handleDelete}
                  className="btn btn-danger flex items-center space-x-2"
                >
                  <Trash2 size={16} />
                  <span>Delete</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto flex flex-col">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 flex flex-col w-full">
        <div className="mb-6 flex-shrink-0">
          {isLoading ? (
            <>
              <div className="h-9 bg-dark-border/50 rounded animate-pulse w-96 mb-2"></div>
              <div className="h-5 bg-dark-border/50 rounded animate-pulse w-64"></div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold text-gray-100 mb-2">{work?.title}</h1>
              {work?.client_name && (
                <p className="text-gray-400">Client: {work.client_name}</p>
              )}
              {work?.description && (
                <p className="text-gray-500 mt-2">{work.description}</p>
              )}
              {work?.tags && work.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {work.tags.map((tag: string, i: number) => (
                    <span key={i} className="text-sm bg-dark-border px-3 py-1 rounded text-gray-400">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 flex-shrink-0">
          <div className="card">
            <div className="flex items-center space-x-3 mb-2">
              <Play className="text-purple-500" size={20} />
              <span className="text-sm text-gray-400">Timer</span>
            </div>
            {runningSession ? (
              <div className="space-y-2">
                <p className="text-2xl font-mono font-bold text-gray-100">
                  {formatDuration(elapsed)}
                </p>
                {permissions.canCreate && (
                  <button
                    onClick={handleStopTimer}
                    className="btn btn-danger btn-sm flex items-center space-x-2 w-full justify-center"
                  >
                    <Pause size={14} />
                    <span>Stop</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {permissions.canCreate ? (
                  <button
                    onClick={handleStartTimer}
                    disabled={startMutation.isPending}
                    className="btn btn-primary btn-sm flex items-center space-x-2 w-full justify-center mt-2"
                  >
                    <Play size={14} />
                    <span>Start</span>
                  </button>
                ) : (
                  <p className="text-sm text-gray-500 mt-2">No active timer</p>
                )}
              </>
            )}
          </div>

          <div className="card">
            <div className="flex items-center space-x-3 mb-2">
              <Clock className="text-blue-500" size={20} />
              <span className="text-sm text-gray-400">Total Time</span>
            </div>
            {isLoading ? (
              <>
                <div className="h-8 bg-dark-border/50 rounded animate-pulse w-32 mb-2"></div>
                <div className="h-4 bg-dark-border/50 rounded animate-pulse w-20"></div>
              </>
            ) : (
              <>
                <p className="text-2xl font-bold text-gray-100">
                  {formatDuration(stats?.totalDuration || 0)}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {totalHours.toFixed(2)} hours
                </p>
              </>
            )}
          </div>

          {(work?.hourly_rate || isLoading) && (
            <div className="card">
              <div className="flex items-center space-x-3 mb-2">
                <DollarSign className="text-green-500" size={20} />
                <span className="text-sm text-gray-400">Estimated Earnings</span>
              </div>
              {isLoading ? (
                <>
                  <div className="h-8 bg-dark-border/50 rounded animate-pulse w-32 mb-2"></div>
                  <div className="h-4 bg-dark-border/50 rounded animate-pulse w-24"></div>
                </>
              ) : (
                <>
                  <p className="text-2xl font-bold text-gray-100">
                    ${estimatedEarnings?.toFixed(2) || '0.00'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ${work?.hourly_rate}/hour
                  </p>
                </>
              )}
            </div>
          )}

          <div className="card">
            <div className="flex items-center space-x-3 mb-2">
              <Play className="text-purple-500" size={20} />
              <span className="text-sm text-gray-400">Sessions</span>
            </div>
            {isLoading ? (
              <div className="h-8 bg-dark-border/50 rounded animate-pulse w-16"></div>
            ) : (
              <p className="text-2xl font-bold text-gray-100">{sessions.length}</p>
            )}
          </div>
        </div>

        {/* Visual Timeline Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1" style={{ minHeight: '500px' }}>
          {/* Main Timeline */}
          <div className="order-2 lg:order-1 lg:col-span-2 card flex flex-col h-full" style={{ minHeight: '500px' }}>
            {isLoading ? (
              <div className="space-y-4 p-4">
                <div className="h-6 bg-dark-border/50 rounded animate-pulse w-48"></div>
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-4 bg-dark-border/50 rounded animate-pulse w-32"></div>
                    <div className="h-20 bg-dark-border/30 rounded animate-pulse"></div>
                  </div>
                ))}
              </div>
            ) : (
              <VisualTimeline
                entries={timelineEntries}
                sessions={sessions}
                runningSession={runningSession || null}
                scrollToSessionId={scrollToSessionId}
                onEditEntry={handleEditEntry}
                onDeleteEntry={handleDeleteEntry}
                canEditEntry={(entry) => permissions.canEditResource(entry.user_id)}
                canDeleteEntry={(entry) => permissions.canDeleteResource(entry.user_id)}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="order-1 lg:order-2 space-y-6 h-full overflow-y-auto" style={{ minHeight: '500px' }}>
            {/* Quick Note Input - Only for running sessions and users with create access */}
            {runningSession && permissions.canCreate && (
              <QuickNoteInput
                workId={workId}
                sessionId={runningSession.id}
                onSuccess={() => {
                  queryClient.invalidateQueries({ queryKey: ['timeline'] });
                }}
              />
            )}

            {/* Alternative: Modal Form Button - Only for users with create access */}
            {runningSession && permissions.canCreate && (
              <button
                onClick={() => setShowTimelineForm(true)}
                className="btn btn-secondary w-full flex items-center justify-center space-x-2"
              >
                <Plus size={16} />
                <span>Advanced Entry Form</span>
              </button>
            )}

            {/* File Storage Section */}
            {user && (
              <FileStorageSection
                workId={workId}
                userId={user.userId}
                canCreate={permissions.canCreate}
                canDeleteResource={permissions.canDeleteResource}
              />
            )}

            {/* Session History */}
            <div className="card flex-1 flex flex-col">
              <h3 className="text-lg font-bold text-gray-100 mb-3">Sessions History</h3>
              <div className="space-y-2 overflow-y-auto max-h-96">
                {isLoading ? (
                  <>
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="bg-dark-bg border border-dark-border rounded p-2">
                        <div className="h-4 bg-dark-border/50 rounded animate-pulse w-24 mb-2"></div>
                        <div className="h-4 bg-dark-border/50 rounded animate-pulse w-32"></div>
                      </div>
                    ))}
                  </>
                ) : sessions.length === 0 ? (
                  <p className="text-gray-500 text-center py-4 text-sm">
                    No sessions yet. Start a timer to begin tracking!
                  </p>
                ) : (
                  sessions.map((session: TimeSession) => (
                  <div
                    key={session.id}
                    className="w-full bg-dark-bg border border-dark-border hover:border-gray-600 rounded p-2 text-xs transition-colors group relative"
                  >
                    <div
                      onClick={() => setScrollToSessionId(session.id)}
                      className="cursor-pointer"
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
                    </div>
                    {!session.is_running && user && permissions.canDeleteResource(session.user_id) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(session.id);
                        }}
                        className="absolute bottom-1 right-1 p-1 opacity-0 group-hover:opacity-100 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400 transition-opacity"
                        title="Delete session"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
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

      {editingEntry && (
        <EditTimelineModal
          entry={editingEntry}
          onClose={() => setEditingEntry(null)}
          onSave={handleSaveEntry}
        />
      )}

      {showShareModal && work && (
        <WorkSharingModal
          workId={workId}
          shares={shares}
          onClose={() => setShowShareModal(false)}
        />
      )}
    </div>
  );
}
