import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Clock, LogOut, Settings, ChevronDown, User, Key, Users, FolderPlus, Edit2, Trash2, Pause } from 'lucide-react';
import { worksApi, workGroupsApi, workSharingApi, sessionsApi, authApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { usePermissions } from '../hooks/usePermissions';
import { useUserPermissions } from '../hooks/useUserPermissions';
import { useTimer, formatDuration } from '../hooks/useTimer';
import WorkForm from '../components/WorkForm';
import CreateGroupModal from '../components/CreateGroupModal';
import type { Work } from '../types';
import { PERMISSION_LEVELS, type WorkPermissionLevel } from '../types/permissions';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const { can } = useUserPermissions();
  const [showForm, setShowForm] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupTitle, setEditingGroupTitle] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time updates via unified SSE stream (initialized in App.tsx)
  // Dashboard data populated automatically via SSE snapshot and events
  // Pattern: initialData prevents fetching while still subscribing to cache updates
  const queryClient = useQueryClient();

  // SSE populates these queries via snapshot event, but provide HTTP fallback
  const { data: ownedWorks = [] } = useQuery<any[]>({
    queryKey: ['works'],
    queryFn: async () => {
      const response = await worksApi.getAll();
      return response.data;
    },
    initialData: [],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
  });

  const { data: sharedWorks = [] } = useQuery<any[]>({
    queryKey: ['shared-works'],
    queryFn: async () => {
      return await workSharingApi.getSharedWithMe();
    },
    initialData: [],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
  });

  // Fetch work groups
  const { data: groups = [] } = useQuery({
    queryKey: ['work-groups'],
    queryFn: async () => {
      const response = await workGroupsApi.getAll();
      return response.data;
    },
  });

  // Combine owned and shared works, marking each with ownership info
  const works = [
    ...ownedWorks.map((work: Work) => ({ ...work, isOwned: true, isShared: false })),
    ...sharedWorks.map((work: any) => ({
      ...work,
      isOwned: false,
      isShared: true,
      // The shared work response includes permission level
      permissionLevel: work.permissionLevel || 'viewer',
      canEdit: work.canEdit || false
    }))
  ].filter((work) => {
    // Apply status filter to combined works
    if (statusFilter && work.status !== statusFilter) return false;
    // Apply search filter to combined works
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        work.title?.toLowerCase().includes(term) ||
        work.description?.toLowerCase().includes(term) ||
        work.client_name?.toLowerCase().includes(term)
      );
    }
    return true;
  });

  // Group works by group_id
  const groupedWorks = useMemo(() => {
    const grouped: Record<number | 'ungrouped', any[]> = { ungrouped: [] };

    works.forEach(work => {
      if (work.group_id) {
        if (!grouped[work.group_id]) grouped[work.group_id] = [];
        grouped[work.group_id].push(work);
      } else {
        grouped.ungrouped.push(work);
      }
    });

    return grouped;
  }, [works]);

  // Get running sessions from cache (populated by SSE only)
  const { data: allRunningSessions = [] } = useQuery<any[]>({
    queryKey: ['running-sessions-all'],
    queryFn: () => Promise.reject('This query should never fetch - SSE provides data'),
    initialData: [], // Start empty, SSE will populate
    staleTime: Infinity,
  });

  // PERFORMANCE: Build a map of running sessions by work_id for O(1) lookup
  const runningSessionsByWork = useMemo(() => {
    const map = new Map<number, any[]>();
    allRunningSessions.forEach((session: any) => {
      if (!map.has(session.work_id)) {
        map.set(session.work_id, []);
      }
      map.get(session.work_id)!.push(session);
    });
    return map;
  }, [allRunningSessions]);

  // Get user's running session from cache (populated by SSE only)
  const runningSession = queryClient.getQueryData(['sessions', 'running']) as any;

  const elapsed = useTimer(runningSession ?? null);

  const stopMutation = useMutation({
    mutationFn: (sessionId: number) => sessionsApi.stop(sessionId),
    onSuccess: (_data, sessionId) => {
      // Optimistically clear the running session immediately
      queryClient.setQueryData(['sessions', 'running'], null);

      // Remove from all running sessions list
      queryClient.setQueryData(
        ['running-sessions-all'],
        (old: any[] = []) => old.filter(s => s.id !== sessionId)
      );

      // Invalidate to refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (error: any) => {
      if (error.response?.status === 403) {
        alert('Permission denied: You do not have permission to stop this timer. Manager permission required to stop others\' sessions.');
      } else {
        alert('Failed to stop timer: ' + (error.response?.data?.error || error.message || 'Unknown error'));
      }
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => authApi.logout(),
    onSuccess: () => {
      // Navigate to login page
      window.location.href = '/login';
    },
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) =>
      workGroupsApi.update(id, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-groups'] });
      setEditingGroupId(null);
      setEditingGroupTitle('');
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => workGroupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['work-groups'] });
      queryClient.invalidateQueries({ queryKey: ['works'] });
    },
  });

  const handleStopTimer = () => {
    if (runningSession) {
      stopMutation.mutate(runningSession.id);
    }
  };

  const handleEditGroup = (groupId: number, currentTitle: string) => {
    setEditingGroupId(groupId);
    setEditingGroupTitle(currentTitle);
  };

  const handleSaveGroupTitle = () => {
    if (editingGroupId && editingGroupTitle.trim()) {
      updateGroupMutation.mutate({ id: editingGroupId, title: editingGroupTitle.trim() });
    }
  };

  const handleDeleteGroup = (groupId: number, groupTitle: string) => {
    if (confirm(`Delete group "${groupTitle}"? Works in this group will become ungrouped.`)) {
      deleteGroupMutation.mutate(groupId);
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
              {hasPermission('admin.access') && (
                <button
                  onClick={() => navigate('/admin')}
                  className="btn btn-secondary flex items-center space-x-2"
                  title="Admin Panel"
                >
                  <Settings size={16} />
                  <span>Admin</span>
                </button>
              )}

              {/* User Menu Dropdown */}
              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-md text-gray-300 hover:bg-dark-hover transition-colors"
                >
                  <User size={18} />
                  <span className="text-sm">{user?.username}</span>
                  <ChevronDown size={16} className={`transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 bg-dark-surface border border-dark-border rounded-lg shadow-lg py-2 z-50">
                    <div className="px-4 py-2 border-b border-dark-border">
                      <p className="text-sm font-medium text-gray-100">{user?.username}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                    </div>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/settings');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-hover flex items-center space-x-3"
                    >
                      <Settings size={16} />
                      <span>User Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        navigate('/change-password');
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-dark-hover flex items-center space-x-3"
                    >
                      <Key size={16} />
                      <span>Change Password</span>
                    </button>

                    <div className="border-t border-dark-border my-2"></div>

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logoutMutation.mutate();
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-dark-hover flex items-center space-x-3"
                    >
                      <LogOut size={16} />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
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
          <div className="flex space-x-2">
            {can.createWorks && (
              <>
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="btn btn-secondary flex items-center space-x-2"
                >
                  <FolderPlus size={20} />
                  <span>New Group</span>
                </button>
                <button
                  onClick={() => setShowForm(true)}
                  className="btn btn-primary flex items-center space-x-2"
                >
                  <Plus size={20} />
                  <span>New Work</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Render groups with their works */}
        <div className="space-y-8">
          {groups.map(group => (
            <div key={group.id} className="work-group">
              {/* Group header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-dark-border">
                {editingGroupId === group.id ? (
                  <div className="flex items-center space-x-2 flex-1">
                    <input
                      type="text"
                      value={editingGroupTitle}
                      onChange={(e) => setEditingGroupTitle(e.target.value)}
                      className="input flex-1 max-w-md"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveGroupTitle();
                        if (e.key === 'Escape') {
                          setEditingGroupId(null);
                          setEditingGroupTitle('');
                        }
                      }}
                    />
                    <button
                      onClick={handleSaveGroupTitle}
                      className="btn btn-sm btn-primary"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => {
                        setEditingGroupId(null);
                        setEditingGroupTitle('');
                      }}
                      className="btn btn-sm btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-gray-100">{group.title}</h2>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => handleEditGroup(group.id, group.title)}
                        className="p-2 text-gray-400 hover:text-gray-100 hover:bg-dark-hover rounded"
                        title="Edit group name"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteGroup(group.id, group.title)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-dark-hover rounded"
                        title="Delete group"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Works grid for this group */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(groupedWorks[group.id] || []).map((work: any) => {
                  const hasActiveTimer = runningSessionsByWork.has(work.id);
                  const runningSessions = runningSessionsByWork.get(work.id) || [];

                  return <WorkCard
                    key={work.id}
                    work={work}
                    hasActiveTimer={hasActiveTimer}
                    runningSessions={runningSessions}
                    onNavigate={() => navigate(`/work/${work.id}`)}
                  />;
                })}
              </div>

              {/* Empty state for group */}
              {(!groupedWorks[group.id] || groupedWorks[group.id].length === 0) && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No works in this group
                </div>
              )}
            </div>
          ))}

          {/* Ungrouped works section */}
          {groupedWorks.ungrouped.length > 0 && (
            <div className="work-group">
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-dark-border"/>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedWorks.ungrouped.map((work: any) => {
                  const hasActiveTimer = runningSessionsByWork.has(work.id);
                  const runningSessions = runningSessionsByWork.get(work.id) || [];

                  return <WorkCard
                    key={work.id}
                    work={work}
                    hasActiveTimer={hasActiveTimer}
                    runningSessions={runningSessions}
                    onNavigate={() => navigate(`/work/${work.id}`)}
                  />;
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {works.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No works found. Create your first work to get started!</p>
            </div>
          )}
        </div>
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

      {showCreateGroupModal && (
        <CreateGroupModal
          onClose={() => setShowCreateGroupModal(false)}
        />
      )}
    </div>
  );
}

// WorkCard component for individual work display
function WorkCard({
  work,
  hasActiveTimer,
  runningSessions,
  onNavigate,
}: {
  work: any;
  hasActiveTimer: boolean;
  runningSessions: any[];
  onNavigate: () => void;
}) {
  // ASK #7: Query total time for this work and update in real-time
  const { data: stats } = useQuery({
    queryKey: ['sessions', 'stats', work.id],
    queryFn: async () => {
      const response = await sessionsApi.getStats(work.id);
      return response.data;
    },
    staleTime: 30000, // 30 seconds
    refetchInterval: hasActiveTimer ? 10000 : false, // Refetch every 10s if timer active
  });

  const totalDuration = stats?.totalDuration || 0;

  // Calculate current session time for active timers
  const currentSessionTime = useMemo(() => {
    if (!hasActiveTimer || runningSessions.length === 0) return 0;
    return runningSessions.reduce((total: number, session: any) => {
      const start = new Date(session.start_time).getTime();
      const elapsed = Date.now() - start;
      return total + elapsed;
    }, 0);
  }, [hasActiveTimer, runningSessions]);

  // Live updating elapsed time for running sessions
  const [liveElapsed, setLiveElapsed] = useState(currentSessionTime);

  useEffect(() => {
    if (!hasActiveTimer) {
      setLiveElapsed(0);
      return;
    }

    // Update every second
    const interval = setInterval(() => {
      const elapsed = runningSessions.reduce((total: number, session: any) => {
        const start = new Date(session.start_time).getTime();
        return total + (Date.now() - start);
      }, 0);
      setLiveElapsed(elapsed);
    }, 1000);

    return () => clearInterval(interval);
  }, [hasActiveTimer, runningSessions]);

  return (
    <div
      className="card hover:bg-dark-hover cursor-pointer transition-colors"
      onClick={onNavigate}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-lg font-semibold text-gray-100 flex-1">{work.title}</h3>
        <div className="flex items-center space-x-2">
          {hasActiveTimer && (
            <div className="flex items-center space-x-1 text-xs text-green-400 bg-green-500 bg-opacity-10 px-2 py-1 rounded shrink-0">
              <Clock size={12} className="animate-pulse" />
              <span>Active</span>
            </div>
          )}
          {work.isShared && (
            <div className="flex items-center space-x-1 text-xs text-blue-400 bg-blue-500 bg-opacity-10 px-2 py-1 rounded shrink-0">
              <Users size={12} />
              <span>Shared ({work.permissionLevel ? PERMISSION_LEVELS[work.permissionLevel as WorkPermissionLevel].name : 'Viewer'})</span>
            </div>
          )}
        </div>
      </div>
      {work.isShared && work.ownerUsername && (
        <p className="text-xs text-gray-500 mb-2">Owner: {work.ownerUsername}</p>
      )}
      {work.client_name && (
        <p className="text-sm text-gray-400 mb-2">Client: {work.client_name}</p>
      )}
      {work.description && (
        <p className="text-sm text-gray-500 mb-3 line-clamp-2">{work.description}</p>
      )}
      {work.tags && work.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {work.tags.map((tag: string, i: number) => (
            <span key={i} className="tag">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* ASK #7: Total time display with current session as subtext */}
      <div className="mb-3 p-3 bg-dark-bg rounded-lg border border-dark-border">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500 uppercase tracking-wide">Total Time</span>
          <Clock size={14} className="text-gray-500" />
        </div>
        <div className="mt-1">
          <div className="text-2xl font-bold text-gray-100 font-mono">
            {formatDuration(totalDuration + liveElapsed)}
          </div>
          {hasActiveTimer && liveElapsed > 0 && (
            <div className="text-xs text-green-400 mt-1">
              Current session: {formatDuration(liveElapsed)}
            </div>
          )}
        </div>
      </div>

      {hasActiveTimer && (
        <div className="flex justify-end items-center mt-4 pt-4 border-t border-dark-border">
          <span className="text-xs text-green-400 font-medium">Active</span>
        </div>
      )}
    </div>
  );
}
