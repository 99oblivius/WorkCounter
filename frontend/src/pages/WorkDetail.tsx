import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Edit, Trash2, Play, Pause, Plus, Clock, DollarSign } from 'lucide-react';
import { worksApi, sessionsApi, timelineApi } from '../services/api';
import { useTimer, formatDuration } from '../hooks/useTimer';
import WorkForm from '../components/WorkForm';
import TimelineForm from '../components/TimelineForm';
import type { TimeSession } from '../types';

export default function WorkDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workId = parseInt(id!, 10);

  const [showEditForm, setShowEditForm] = useState(false);
  const [showTimelineForm, setShowTimelineForm] = useState(false);

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

  const { data: timelineEntries = [] } = useQuery({
    queryKey: ['timeline', 'work', workId],
    queryFn: async () => {
      const response = await timelineApi.getByWorkId(workId);
      return response.data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['sessions', 'stats', workId],
    queryFn: async () => {
      const response = await sessionsApi.getStats(workId);
      return response.data;
    },
  });

  const runningSession = sessions.find((s: TimeSession) => s.is_running);
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
    <div className="min-h-screen bg-dark-bg">
      <header className="bg-dark-surface border-b border-dark-border">
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

        <div className="card mb-8">
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
          {runningSession && (
            <button
              onClick={() => setShowTimelineForm(true)}
              className="btn btn-secondary flex items-center space-x-2 mt-4"
            >
              <Plus size={16} />
              <span>Add Timeline Entry</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Time Sessions</h2>
            <div className="space-y-3">
              {sessions.map((session: TimeSession) => (
                <div
                  key={session.id}
                  className="bg-dark-bg border border-dark-border rounded p-3"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-sm text-gray-400">
                        {new Date(session.start_time).toLocaleString()}
                      </p>
                      {session.end_time && (
                        <p className="text-sm text-gray-500">
                          to {new Date(session.end_time).toLocaleString()}
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-medium ${session.is_running ? 'text-green-500' : 'text-gray-400'}`}>
                      {session.is_running ? 'Running' : formatDuration(session.duration_ms || 0)}
                    </span>
                  </div>
                </div>
              ))}
              {sessions.length === 0 && (
                <p className="text-gray-500 text-center py-4">No sessions yet</p>
              )}
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-bold text-gray-100 mb-4">Timeline</h2>
            <div className="space-y-3">
              {timelineEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="bg-dark-bg border border-dark-border rounded p-3"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm text-gray-400">
                      {new Date(entry.timestamp).toLocaleString()}
                    </p>
                    {entry.activity_type && (
                      <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">
                        {entry.activity_type}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-100">{entry.label}</p>
                </div>
              ))}
              {timelineEntries.length === 0 && (
                <p className="text-gray-500 text-center py-4">No timeline entries yet</p>
              )}
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
