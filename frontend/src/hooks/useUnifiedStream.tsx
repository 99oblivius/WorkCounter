import { useEffect, useRef, useState, useCallback, createContext, useContext } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { streamApi } from '../services/api';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface UnifiedStreamSnapshot {
  user: {
    permissions: any;
    limits: any;
  };
  ownedWorks: any[];
  sharedWorks: any[];
  runningSessions: any[];
  timestamp: string;
  connectionId: string; // Server confirms our connection ID
}

interface WorkSnapshot {
  work: any;
  sessions: any[];
  timeline: any[];
  files: any[];
  stats: any;
  shares: any[];
  permissions: any;
}

/**
 * useUnifiedStream - Single SSE connection for all real-time updates
 *
 * Architecture:
 * - ONE EventSource connection per client (browser SSE limit friendly)
 * - Connects on app load, stays open across navigation
 * - Context updates via HTTP tell server what data to stream
 * - Handles user-level events (dashboard) and work-level events (work pages)
 *
 * Usage:
 * ```tsx
 * // App.tsx (root level)
 * const { isConnected, currentContext } = useUnifiedStream();
 *
 * // WorkPage.tsx
 * const { updateContext } = useUnifiedStreamContext();
 * useEffect(() => {
 *   updateContext(workId);
 *   return () => updateContext(null);
 * }, [workId]);
 * ```
 *
 * @param enabled - Whether to enable the stream (default: true)
 */
export function useUnifiedStream(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Generate unique connection ID for this SSE connection (for multi-tab support)
  // This persists across reconnections to maintain stable identity
  const connectionIdRef = useRef(`conn-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`);

  // CRITICAL: Stabilize userId to prevent reconnections when user object reference changes
  const [stableUserId, setStableUserId] = useState<number | null>(null);

  // Only update state when userId value actually changes
  useEffect(() => {
    const newUserId = user?.userId ?? null;
    if (newUserId !== stableUserId) {
      setStableUserId(newUserId);
    }
  }, [user?.userId, stableUserId]);

  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'reconnecting' | null>(null);
  const [currentContext, setCurrentContext] = useState<number | null>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);
  const isUpdatingContext = useRef(false);
  const shouldReconnect = useRef(true);
  const hasReceivedSnapshot = useRef(false);
  const hasConnectedOnce = useRef(false);

  /**
   * Update user's viewing context (dashboard vs work page)
   * Now includes connectionId for per-connection context (multi-tab support)
   */
  const updateContext = useCallback(async (workId: number | null) => {
    // Guard: Don't update if already updating
    if (isUpdatingContext.current) {
      return;
    }

    // Guard: Don't update if context is the same
    if (currentContext === workId) {
      return;
    }

    // Guard: Don't update if not connected (unless clearing context on unmount)
    if (!isConnected && workId !== null) {
      console.warn(`[SSE] Cannot update context, not connected`);
      return;
    }

    isUpdatingContext.current = true;
    try {
      await streamApi.updateContext(workId, connectionIdRef.current);
      setCurrentContext(workId);
    } catch (error) {
      console.error(`[SSE] Failed to update context:`, error);
    } finally {
      isUpdatingContext.current = false;
    }
  }, [currentContext, isConnected]);

  /**
   * Reconnection logic with constant 2s interval for responsiveness
   */
  const attemptReconnect = useCallback(() => {
    if (!shouldReconnect.current || !stableUserId) {
      return;
    }

    const delay = 2000; // Constant 2 second retry for responsive reconnection
    reconnectAttempts.current++;
    setConnectionStatus('reconnecting');

    reconnectTimeoutRef.current = window.setTimeout(() => {
      if (shouldReconnect.current && stableUserId) {
        // Close any existing connection
        if (eventSourceRef.current) {
          eventSourceRef.current.close();
          eventSourceRef.current = null;
        }
        // Reset snapshot flag to trigger cache refresh
        hasReceivedSnapshot.current = false;
        setIsConnected(false);
        // Trigger useEffect to create new connection
        setReconnectTrigger(prev => prev + 1);
      }
    }, delay);
  }, [stableUserId]);

  useEffect(() => {
    if (!enabled || !stableUserId) {
      shouldReconnect.current = false;
      return;
    }

    shouldReconnect.current = true;

    // Create single EventSource connection with connection ID for multi-tab support
    const eventSource = new EventSource(
      `${API_URL}/api/stream?connectionId=${encodeURIComponent(connectionIdRef.current)}`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      hasConnectedOnce.current = true;

      // Clear any pending reconnection attempts
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    // ============================================
    // INITIAL SNAPSHOT
    // ============================================
    eventSource.addEventListener('snapshot', (event) => {
      const data: UnifiedStreamSnapshot = JSON.parse(event.data);

      // Detect reconnection: if this is not the first snapshot, we reconnected
      const isReconnection = hasReceivedSnapshot.current;
      hasReceivedSnapshot.current = true;

      if (isReconnection) {
        // Invalidate all queries to force refetch of fresh data
        queryClient.invalidateQueries();
      }

      // Cache user permissions with both permissions AND limits (matches API structure)
      queryClient.setQueryData(['user-permissions'], {
        permissions: data.user.permissions,
        limits: data.user.limits,
      });

      // Cache dashboard data
      queryClient.setQueryData(['works'], data.ownedWorks);
      queryClient.setQueryData(['shared-works'], data.sharedWorks);
      // Ensure running sessions are sorted by start_time descending
      queryClient.setQueryData(['running-sessions-all'],
        data.runningSessions.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      );

      // Extract current user's running session
      const userRunningSession = data.runningSessions.find(
        (s: any) => s.user_id === stableUserId && s.is_running
      ) || null;
      queryClient.setQueryData(['sessions', 'running'], userRunningSession);
    });

    // ============================================
    // WORK SNAPSHOT (Context Switch)
    // ============================================
    eventSource.addEventListener('work:snapshot', (event) => {
      const data: WorkSnapshot = JSON.parse(event.data);
      const workId = data.work.id;

      // Update React Query caches with work data
      queryClient.setQueryData(['works', workId], data.work);
      // Ensure sessions are sorted by start_time descending (backend provides sorted, but enforce client-side)
      queryClient.setQueryData(['sessions', 'work', workId],
        data.sessions.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
      );
      queryClient.setQueryData(['timeline', 'work', workId], data.timeline);
      // Wrap files array in paginated response to match HTTP API structure
      queryClient.setQueryData(['files', 'work', workId], {
        data: data.files,
        cursor: null,
        hasMore: false
      });
      queryClient.setQueryData(['sessions', 'stats', workId], data.stats);
      queryClient.setQueryData(['work-shares', workId], { shares: data.shares });
      queryClient.setQueryData(['work-permissions', workId], data.permissions);
    });

    // ============================================
    // USER-LEVEL EVENTS (Dashboard)
    // ============================================

    // Permission changes
    eventSource.addEventListener('permissions:updated', (event) => {
      const { action, workId } = JSON.parse(event.data);

      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });

      if (action === 'share_permission_updated' && workId) {
        const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;
        queryClient.refetchQueries({ queryKey: ['work-permissions', workIdNum] });
        queryClient.invalidateQueries({ queryKey: ['works', workIdNum] });
        queryClient.invalidateQueries({ queryKey: ['shared-works'] });
      }
    });

    // Account deactivated
    eventSource.addEventListener('account:deactivated', (event) => {
      const { message } = JSON.parse(event.data);
      console.error('[Unified SSE] Account deactivated:', message);

      // Show modal or redirect to logout
      alert(message);
      window.location.href = '/logout';
    });

    // Account activated
    eventSource.addEventListener('account:activated', (event) => {
      const { message } = JSON.parse(event.data);

      // Show notification to user
      alert(message);

      // Refresh permissions to ensure user has latest access
      queryClient.invalidateQueries({ queryKey: ['user-permissions'] });
    });

    // Work created
    eventSource.addEventListener('work:create', (event) => {
      const work = JSON.parse(event.data);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => [work, ...old]
      );
    });

    // Work updated
    eventSource.addEventListener('work:update', (event) => {
      const work = JSON.parse(event.data);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => old.map(w => w.id === work.id ? work : w)
      );

      // Also update in work detail cache if exists
      queryClient.setQueryData(['works', work.id], work);
    });

    // Work deleted
    eventSource.addEventListener('work:delete', (event) => {
      const { id } = JSON.parse(event.data);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => old.filter(w => w.id !== id)
      );
    });

    // Work shared with user
    eventSource.addEventListener('work:shared', (event) => {
      const work = JSON.parse(event.data);

      queryClient.setQueryData(
        ['shared-works'],
        (old: any[] = []) => [work, ...old]
      );
    });

    // Work access revoked
    eventSource.addEventListener('work:unshared', (event) => {
      const { workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(
        ['shared-works'],
        (old: any[] = []) => old.filter(w => w.id !== workIdNum)
      );

      if (currentContext === workIdNum) {
        alert('Your access to this work has been revoked');
        window.location.href = '/';
      }
    });

    // Work group events
    eventSource.addEventListener('workgroup:create', (event) => {
      const group = JSON.parse(event.data);

      queryClient.setQueryData(
        ['work-groups'],
        (old: any[] = []) => [...old, group]
      );
    });

    eventSource.addEventListener('workgroup:update', (event) => {
      const group = JSON.parse(event.data);

      queryClient.setQueryData(
        ['work-groups'],
        (old: any[] = []) => old.map(g => g.id === group.id ? group : g)
      );
    });

    eventSource.addEventListener('workgroup:delete', (event) => {
      const { id } = JSON.parse(event.data);

      queryClient.setQueryData(
        ['work-groups'],
        (old: any[] = []) => old.filter(g => g.id !== id)
      );
    });

    eventSource.addEventListener('workgroup:reorder', () => {
      // Invalidate to refetch with new order
      queryClient.invalidateQueries({ queryKey: ['work-groups'] });
    });

    // ============================================
    // WORK-LEVEL EVENTS (Work Page)
    // ============================================

    // Timeline events
    eventSource.addEventListener('timeline:create', (event) => {
      const entry = JSON.parse(event.data);

      // Always update cache - React Query will only re-render subscribed components
      queryClient.setQueryData(
        ['timeline', 'work', entry.work_id],
        (old: any[] = []) => [...old, entry]
      );
    });

    eventSource.addEventListener('timeline:update', (event) => {
      const entry = JSON.parse(event.data);

      // Always update cache - React Query will only re-render subscribed components
      queryClient.setQueryData(
        ['timeline', 'work', entry.work_id],
        (old: any[] = []) => old.map(e => e.id === entry.id ? entry : e)
      );
    });

    eventSource.addEventListener('timeline:delete', (event) => {
      const { id, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(
        ['timeline', 'work', workIdNum],
        (old: any[] = []) => old.filter(e => e.id !== id)
      );
    });

    // Session events
    eventSource.addEventListener('session:start', (event) => {
      const session = JSON.parse(event.data);

      // UPSERT: Add if new, update if exists (prevents duplicates from dual channel subscription)
      // Users viewing a work receive this event twice (work + user channel)
      queryClient.setQueryData(
        ['sessions', 'work', session.work_id],
        (old: any[] = []) => {
          // Check if session already exists
          const exists = old.some(s => s.id === session.id);
          if (exists) {
            // Update existing session (handles duplicate event from second channel)
            return old.map(s => s.id === session.id ? session : s);
          }
          // Add new session and sort by start_time descending (newest first)
          return [session, ...old].sort((a, b) =>
            new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
          );
        }
      );

      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', session.work_id] });

      // Update running sessions list (for dashboard) - same upsert logic
      queryClient.setQueryData(
        ['running-sessions-all'],
        (old: any[] = []) => {
          const exists = old.some(s => s.id === session.id);
          if (exists) {
            return old.map(s => s.id === session.id ? session : s);
          }
          return [session, ...old].sort((a, b) =>
            new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
          );
        }
      );
    });

    eventSource.addEventListener('session:stop', (event) => {
      const session = JSON.parse(event.data);

      // Update session and maintain sort order (end_time changes)
      queryClient.setQueryData(
        ['sessions', 'work', session.work_id],
        (old: any[] = []) => {
          return old.map(s => s.id === session.id ? session : s)
            .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        }
      );

      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', session.work_id] });

      // Remove from running sessions list (for dashboard)
      queryClient.setQueryData(
        ['running-sessions-all'],
        (old: any[] = []) => old.filter(s => s.id !== session.id)
      );

      // Clear user's running session if this is their session
      const currentRunning = queryClient.getQueryData(['sessions', 'running']) as any;
      if (currentRunning?.id === session.id) {
        queryClient.setQueryData(['sessions', 'running'], null);
      }
    });

    eventSource.addEventListener('session:update', (event) => {
      const session = JSON.parse(event.data);

      // Update session and maintain sort order (start_time or end_time might change)
      queryClient.setQueryData(
        ['sessions', 'work', session.work_id],
        (old: any[] = []) => {
          return old.map(s => s.id === session.id ? session : s)
            .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
        }
      );

      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', session.work_id] });
    });

    eventSource.addEventListener('session:delete', (event) => {
      const { id, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(
        ['sessions', 'work', workIdNum],
        (old: any[] = []) => {
          return old.filter(s => s.id !== id);
        }
      );

      queryClient.setQueryData(
        ['timeline', 'work', workIdNum],
        (old: any[] = []) => old.filter(e => e.time_session_id !== id)
      );
      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', workIdNum] });
    });

    // File events
    eventSource.addEventListener('file:upload', (event) => {
      const file = JSON.parse(event.data);

      // Always update cache - React Query will only re-render subscribed components
      queryClient.setQueryData(
        ['files', 'work', file.work_id],
        (old: any) => {
          // Handle paginated response format
          if (old && 'data' in old) {
            return { ...old, data: [file, ...old.data] };
          }
          // Fallback for array format
          return [file, ...(Array.isArray(old) ? old : [])];
        }
      );
    });

    eventSource.addEventListener('file:delete', (event) => {
      const { id, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(
        ['files', 'work', workIdNum],
        (old: any) => {
          if (old && 'data' in old) {
            return { ...old, data: old.data.filter((f: any) => f.id !== id) };
          }
          return Array.isArray(old) ? old.filter((f: any) => f.id !== id) : [];
        }
      );
    });

    // Sharing events - these need workId from the event data
    eventSource.addEventListener('share:add', (event) => {
      const { shares, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(['work-shares', workIdNum], { shares });
      queryClient.refetchQueries({ queryKey: ['work-permissions', workIdNum] });
    });

    eventSource.addEventListener('share:update', (event) => {
      const { shares, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(['work-shares', workIdNum], { shares });
      queryClient.refetchQueries({ queryKey: ['work-permissions', workIdNum] });
      queryClient.invalidateQueries({ queryKey: ['works', workIdNum] });
    });

    eventSource.addEventListener('share:remove', (event) => {
      const { shares, workId } = JSON.parse(event.data);
      const workIdNum = typeof workId === 'string' ? parseInt(workId, 10) : workId;

      queryClient.setQueryData(['work-shares', workIdNum], { shares });
      queryClient.refetchQueries({ queryKey: ['work-permissions', workIdNum] });
    });

    // NOTE: sessions:activity event removed - session:start/stop now come through user channel too
    // This eliminates duplicate updates and N+1 database queries on the backend

    // ============================================
    // ERROR HANDLING
    // ============================================
    eventSource.onerror = (error) => {
      console.error('[Unified SSE] Connection error:', error, 'ReadyState:', eventSource.readyState);
      setIsConnected(false);

      // Only show disconnected status if we've successfully connected before
      // This prevents showing "connection lost" on initial page load
      if (hasConnectedOnce.current) {
        setConnectionStatus('disconnected');
      }

      // Close current connection
      eventSource.close();
      eventSourceRef.current = null;

      // Attempt reconnection with exponential backoff
      if (shouldReconnect.current) {
        attemptReconnect();
      }
    };

    // Cleanup on unmount
    return () => {
      shouldReconnect.current = false;
      hasReceivedSnapshot.current = false;
      hasConnectedOnce.current = false;
      eventSource.close();
      eventSourceRef.current = null;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
  }, [enabled, stableUserId, queryClient, attemptReconnect, reconnectTrigger]); // reconnectTrigger forces re-creation of connection

  return {
    isConnected,
    connectionStatus,
    currentContext,
    updateContext,
  };
}

/**
 * React Context for sharing single SSE connection across entire app
 */
interface UnifiedStreamContextType {
  isConnected: boolean;
  connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | null;
  currentContext: number | null;
  updateContext: (workId: number | null) => Promise<void>;
}

const UnifiedStreamContext = createContext<UnifiedStreamContextType | null>(null);

/**
 * Provider component - wrap your app with this to establish single SSE connection
 *
 * Usage:
 * <UnifiedStreamProvider>
 *   <App />
 * </UnifiedStreamProvider>
 */
export function UnifiedStreamProvider({ children }: { children: React.ReactNode }) {
  const stream = useUnifiedStream();

  return (
    <UnifiedStreamContext.Provider value={stream}>
      {children}
    </UnifiedStreamContext.Provider>
  );
}

/**
 * Hook to access the shared SSE connection from any component
 *
 * IMPORTANT: This returns the SAME connection instance for all components
 * No new connections are created when you call this hook
 */
export function useUnifiedStreamContext(): UnifiedStreamContextType {
  const context = useContext(UnifiedStreamContext);

  if (!context) {
    throw new Error('useUnifiedStreamContext must be used within UnifiedStreamProvider');
  }

  return context;
}
