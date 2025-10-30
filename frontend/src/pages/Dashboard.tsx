import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Clock, LogOut, Play, Pause } from 'lucide-react';
import { worksApi, sessionsApi, authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useTimer, formatDuration } from '../hooks/useTimer';
import WorkForm from '../components/WorkForm';
import type { Work } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');

  const { data: works = [] } = useQuery({
    queryKey: ['works', statusFilter, searchTerm],
    queryFn: async () => {
      const response = await worksApi.getAll({
        status: statusFilter,
        search: searchTerm || undefined,
      });
      return response.data;
    },
  });

  const { data: runningSession } = useQuery({
    queryKey: ['sessions', 'running'],
    queryFn: async () => {
      const response = await sessionsApi.getRunning();
      return response.data;
    },
    refetchInterval: 5000,
  });

  const elapsed = useTimer(runningSession);

  const startMutation = useMutation({
    mutationFn: (workId: number) => sessionsApi.start(workId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const stopMutation = useMutation({
    mutationFn: (sessionId: number) => sessionsApi.stop(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      window.location.href = '/login';
    },
  });

  const handleStartTimer = (workId: number) => {
    if (runningSession) {
      alert('Please stop the current timer first');
      return;
    }
    startMutation.mutate(workId);
  };

  const handleStopTimer = () => {
    if (runningSession) {
      stopMutation.mutate(runningSession.id);
    }
  };

  const runningWork = works.find((w: Work) => w.id === runningSession?.work_id);

  return (
    <div className="min-h-screen bg-dark-bg">
      <header className="bg-dark-surface border-b border-dark-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Clock className="text-blue-500" size={32} />
              <h1 className="text-2xl font-bold text-gray-100">WorkCounter</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-400">{user?.username}</span>
              <button
                onClick={() => logoutMutation.mutate()}
                className="btn btn-secondary flex items-center space-x-2"
              >
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {runningSession && (
        <div className="bg-blue-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm opacity-90">Currently tracking</p>
                <p className="text-lg font-semibold">{runningWork?.title || 'Unknown Work'}</p>
              </div>
              <div className="flex items-center space-x-4">
                <span className="text-2xl font-mono">{formatDuration(elapsed)}</span>
                <button
                  onClick={handleStopTimer}
                  className="bg-white text-blue-600 px-4 py-2 rounded-md font-medium hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Pause size={16} />
                  <span>Stop</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex justify-between items-center">
          <div className="flex space-x-4 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search works..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input pl-10 w-64"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input w-40"
            >
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary flex items-center space-x-2"
          >
            <Plus size={20} />
            <span>New Work</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {works.map((work: Work) => (
            <div key={work.id} className="card hover:bg-dark-hover cursor-pointer transition-colors">
              <div onClick={() => navigate(`/work/${work.id}`)}>
                <h3 className="text-lg font-semibold text-gray-100 mb-2">{work.title}</h3>
                {work.client_name && (
                  <p className="text-sm text-gray-400 mb-2">Client: {work.client_name}</p>
                )}
                {work.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{work.description}</p>
                )}
                {work.tags && work.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {work.tags.map((tag, i) => (
                      <span key={i} className="text-xs bg-dark-border px-2 py-1 rounded text-gray-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-dark-border">
                <span className="text-xs text-gray-500 capitalize">{work.status}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStartTimer(work.id);
                  }}
                  disabled={!!runningSession || startMutation.isPending}
                  className="btn btn-primary btn-sm flex items-center space-x-1 disabled:opacity-50"
                >
                  <Play size={14} />
                  <span>Start</span>
                </button>
              </div>
            </div>
          ))}
        </div>

        {works.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No works found. Create your first work to get started!</p>
          </div>
        )}
      </main>

      {showForm && (
        <WorkForm
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['works'] });
          }}
        />
      )}
    </div>
  );
}
