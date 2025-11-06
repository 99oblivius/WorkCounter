import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

interface WorkStreamData {
  work: any;
  sessions: any[];
  timeline: any[];
  files: any[];
  stats: any;
  permissions: any;
  shares: any;
}

/**
 * useWorkStream - Real-time work updates via Server-Sent Events
 *
 * Replaces multiple HTTP requests + polling with a single SSE connection
 * Benefits:
 * - Initial snapshot delivered immediately (all data in one go)
 * - Real-time updates instead of 3s polling
 * - Single connection (browser-friendly)
 * - Automatic reconnection on disconnect
 *
 * @param workId - The work ID to stream updates for
 * @param enabled - Whether to enable the stream (default: true)
 */
export function useWorkStream(workId: number, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [initialData, setInitialData] = useState<WorkStreamData | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttempts = useRef(0);

  useEffect(() => {
    if (!enabled || !workId) return;

    console.log(`[SSE] Connecting to work ${workId} stream...`);

    // Create EventSource with credentials
    const eventSource = new EventSource(
      `${API_URL}/api/works/${workId}/stream`,
      { withCredentials: true }
    );

    eventSourceRef.current = eventSource;

    // Connection opened
    eventSource.onopen = () => {
      console.log(`[SSE] Connected to work ${workId}`);
      setIsConnected(true);
      reconnectAttempts.current = 0;
    };

    // Handle initial snapshot
    eventSource.addEventListener('snapshot', (event) => {
      const data: WorkStreamData = JSON.parse(event.data);
      console.log('[SSE] Received initial snapshot:', data);

      // Update all React Query caches with initial data
      queryClient.setQueryData(['works', workId], data.work);
      queryClient.setQueryData(['sessions', 'work', workId], data.sessions);
      queryClient.setQueryData(['timeline', 'work', workId], data.timeline);
      queryClient.setQueryData(['files', 'work', workId], data.files);
      queryClient.setQueryData(['sessions', 'stats', workId], data.stats);

      if (data.shares) {
        queryClient.setQueryData(['work-shares', workId], { shares: data.shares });
      }

      setInitialData(data);
    });

    // Handle timeline events
    eventSource.addEventListener('timeline:create', (event) => {
      const entry = JSON.parse(event.data);
      console.log('[SSE] Timeline entry created:', entry);

      // Add to timeline cache
      queryClient.setQueryData(
        ['timeline', 'work', workId],
        (old: any[] = []) => [...old, entry]
      );
    });

    eventSource.addEventListener('timeline:update', (event) => {
      const entry = JSON.parse(event.data);
      console.log('[SSE] Timeline entry updated:', entry);

      // Update in timeline cache
      queryClient.setQueryData(
        ['timeline', 'work', workId],
        (old: any[] = []) => old.map(e => e.id === entry.id ? entry : e)
      );
    });

    eventSource.addEventListener('timeline:delete', (event) => {
      const { id } = JSON.parse(event.data);
      console.log('[SSE] Timeline entry deleted:', id);

      // Remove from timeline cache
      queryClient.setQueryData(
        ['timeline', 'work', workId],
        (old: any[] = []) => old.filter(e => e.id !== id)
      );
    });

    // Handle session events
    eventSource.addEventListener('session:start', (event) => {
      const session = JSON.parse(event.data);
      console.log('[SSE] Session started:', session);

      // Prepend to sessions cache (newest first)
      queryClient.setQueryData(
        ['sessions', 'work', workId],
        (old: any[] = []) => [session, ...old]
      );

      // Invalidate stats to recalculate
      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', workId] });
    });

    eventSource.addEventListener('session:stop', (event) => {
      const session = JSON.parse(event.data);
      console.log('[SSE] Session stopped:', session);

      // Update in sessions cache
      queryClient.setQueryData(
        ['sessions', 'work', workId],
        (old: any[] = []) => old.map(s => s.id === session.id ? session : s)
      );

      // Invalidate stats to recalculate
      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', workId] });
    });

    eventSource.addEventListener('session:update', (event) => {
      const session = JSON.parse(event.data);
      console.log('[SSE] Session updated:', session);

      // Update in sessions cache
      queryClient.setQueryData(
        ['sessions', 'work', workId],
        (old: any[] = []) => old.map(s => s.id === session.id ? session : s)
      );

      // Invalidate stats to recalculate
      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', workId] });
    });

    eventSource.addEventListener('session:delete', (event) => {
      const { id } = JSON.parse(event.data);
      console.log('[SSE] Session deleted:', id);

      // Remove from sessions cache
      queryClient.setQueryData(
        ['sessions', 'work', workId],
        (old: any[] = []) => old.filter(s => s.id !== id)
      );

      // Remove timeline entries for this session
      queryClient.setQueryData(
        ['timeline', 'work', workId],
        (old: any[] = []) => old.filter(e => e.time_session_id !== id)
      );

      // Invalidate stats to recalculate
      queryClient.invalidateQueries({ queryKey: ['sessions', 'stats', workId] });
    });

    // Handle file events
    eventSource.addEventListener('file:upload', (event) => {
      const file = JSON.parse(event.data);
      console.log('[SSE] File uploaded:', file);

      // Prepend to files cache (newest first)
      queryClient.setQueryData(
        ['files', 'work', workId],
        (old: any[] = []) => [file, ...old]
      );
    });

    eventSource.addEventListener('file:delete', (event) => {
      const { id } = JSON.parse(event.data);
      console.log('[SSE] File deleted:', id);

      // Remove from files cache
      queryClient.setQueryData(
        ['files', 'work', workId],
        (old: any[] = []) => old.filter(f => f.id !== id)
      );
    });

    // Handle work metadata updates
    eventSource.addEventListener('work:update', (event) => {
      const work = JSON.parse(event.data);
      console.log('[SSE] Work updated:', work);

      // Update work cache
      queryClient.setQueryData(['works', workId], work);
    });

    // Handle sharing events
    eventSource.addEventListener('share:add', (event) => {
      const { shares } = JSON.parse(event.data);
      console.log('[SSE] Share added:', shares);

      // Update shares cache
      queryClient.setQueryData(['work-shares', workId], { shares });

      // Invalidate permissions cache (user's permissions may have changed)
      queryClient.invalidateQueries({ queryKey: ['work-permissions', workId] });
    });

    eventSource.addEventListener('share:remove', (event) => {
      const { shares } = JSON.parse(event.data);
      console.log('[SSE] Share removed:', shares);

      // Update shares cache
      queryClient.setQueryData(['work-shares', workId], { shares });

      // Invalidate permissions cache (user's permissions may have changed)
      queryClient.invalidateQueries({ queryKey: ['work-permissions', workId] });
    });

    // Handle errors
    eventSource.onerror = (error) => {
      console.error('[SSE] Connection error:', error);
      setIsConnected(false);

      // Close current connection
      eventSource.close();

      // Exponential backoff for reconnection
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
      reconnectAttempts.current++;

      console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})...`);

      reconnectTimeoutRef.current = window.setTimeout(() => {
        // Will trigger useEffect to reconnect
        setIsConnected(false);
      }, delay);
    };

    // Cleanup on unmount
    return () => {
      console.log(`[SSE] Disconnecting from work ${workId}`);
      eventSource.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [workId, enabled, queryClient]);

  return {
    isConnected,
    initialData,
  };
}
