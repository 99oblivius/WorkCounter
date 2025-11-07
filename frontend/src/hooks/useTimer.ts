import { useState, useEffect } from 'react';
import type { TimeSession } from '../types';

export function useTimer(session: TimeSession | null) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!session || !session.is_running) {
      if (session?.duration_ms) {
        setElapsed(session.duration_ms);
      } else {
        setElapsed(0);
      }
      return;
    }

    const startTime = new Date(session.start_time).getTime();

    const updateElapsed = () => {
      const now = Date.now();
      setElapsed(now - startTime);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 100);

    return () => clearInterval(interval);
  }, [session]);

  return elapsed;
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDurationShort(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
