import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface UserStreamData {
  ownedWorks: any[];
  sharedWorks: any[];
  runningSessions: any[];
}

/**
 * useUserStream - Real-time dashboard updates via Server-Sent Events
 *
 * Replaces polling for owned/shared works and running sessions
 * Benefits:
 * - Initial snapshot delivered immediately (all data in one go)
 * - Real-time updates when works are shared/unshared
 * - Real-time "Active" indicators across all works
 * - Single SSE connection for entire dashboard
 * - Automatic reconnection on disconnect
 *
 * @param enabled - Whether to enable the stream (default: true)
 */
export function useUserStream(enabled: boolean = true) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [initialData, setInitialData] = useState<UserStreamData | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    console.log('[User SSE] Connecting to user stream...');

    // Create EventSource with credentials
    const eventSource = new EventSource(
      `${API_URL}/api/user/stream`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      console.log('[User SSE] Connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    // Handle initial snapshot
    eventSource.addEventListener('snapshot', (event) => {
      const data: UserStreamData = JSON.parse(event.data);
      console.log('[User SSE] Received initial snapshot:', data);

      // Update React Query caches with initial data
      queryClient.setQueryData(['works'], data.ownedWorks);
      queryClient.setQueryData(['shared-works'], data.sharedWorks);
      queryClient.setQueryData(['running-sessions-all'], data.runningSessions);

      // Extract current user's running session (if any) - filter by user ID
      const userRunningSession = user
        ? data.runningSessions.find((s: any) => s.user_id === user.userId && s.is_running) || null
        : null;
      queryClient.setQueryData(['sessions', 'running'], userRunningSession);

      setInitialData(data);
    });

    // Handle work created/updated
    eventSource.addEventListener('work:create', (event) => {
      const work = JSON.parse(event.data);
      console.log('[User SSE] Work created:', work);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => [work, ...old]
      );
    });

    eventSource.addEventListener('work:update', (event) => {
      const work = JSON.parse(event.data);
      console.log('[User SSE] Work updated:', work);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => old.map(w => w.id === work.id ? work : w)
      );
    });

    eventSource.addEventListener('work:delete', (event) => {
      const { id } = JSON.parse(event.data);
      console.log('[User SSE] Work deleted:', id);

      queryClient.setQueryData(
        ['works'],
        (old: any[] = []) => old.filter(w => w.id !== id)
      );
    });

    // Handle work shared with user
    eventSource.addEventListener('work:shared', (event) => {
      const work = JSON.parse(event.data);
      console.log('[User SSE] Work shared with me:', work);

      queryClient.setQueryData(
        ['shared-works'],
        (old: any[] = []) => [work, ...old]
      );
    });

    // Handle work unshared (access revoked)
    eventSource.addEventListener('work:unshared', (event) => {
      const { workId } = JSON.parse(event.data);
      console.log('[User SSE] Work access revoked:', workId);

      queryClient.setQueryData(
        ['shared-works'],
        (old: any[] = []) => old.filter(w => w.id !== workId)
      );
    });

    // Handle permission level changed
    eventSource.addEventListener('work:permission-changed', (event) => {
      const { workId, permissionLevel } = JSON.parse(event.data);
      console.log('[User SSE] Permission changed:', workId, permissionLevel);

      queryClient.setQueryData(
        ['shared-works'],
        (old: any[] = []) => old.map(w =>
          w.id === workId ? { ...w, permissionLevel } : w
        )
      );
    });

    // Handle running sessions updates
    eventSource.addEventListener('sessions:activity', (event) => {
      const sessions = JSON.parse(event.data);
      console.log('[User SSE] Running sessions updated:', sessions);

      // Update all running sessions cache
      queryClient.setQueryData(['running-sessions-all'], sessions);

      // Extract current user's running session (if any) - filter by user ID
      const userRunningSession = user
        ? sessions.find((s: any) => s.user_id === user.userId && s.is_running) || null
        : null;
      queryClient.setQueryData(['sessions', 'running'], userRunningSession);
    });

    // Handle errors
    eventSource.onerror = (error) => {
      console.error('[User SSE] Connection error:', error);
      setIsConnected(false);

      // Close current connection
      eventSource.close();

      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;

      console.log(`[User SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})...`);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        // Will trigger useEffect to reconnect
        setIsConnected(false);
      }, delay);
    };

    // Cleanup on unmount
    return () => {
      console.log('[User SSE] Disconnecting from user stream');
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [enabled, queryClient, user]);

  return {
    isConnected,
    initialData,
  };
}
