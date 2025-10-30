import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatDuration } from '../hooks/useTimer';
import type { TimelineEntry, TimeSession } from '../types';

interface VisualTimelineProps {
  entries: TimelineEntry[];
  session: TimeSession | null;
  isRunning: boolean;
}

const ACTIVITY_COLORS: Record<string, string> = {
  'Development': 'bg-blue-500',
  'Design': 'bg-purple-500',
  'Meeting': 'bg-yellow-500',
  'Research': 'bg-green-500',
  'Review': 'bg-orange-500',
  'Testing': 'bg-red-500',
  'Documentation': 'bg-cyan-500',
  'Planning': 'bg-pink-500',
  'Bug Fix': 'bg-rose-500',
  'Other': 'bg-gray-500',
};

export default function VisualTimeline({ entries, session, isRunning }: VisualTimelineProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isRunning) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

  useEffect(() => {
    // Auto-scroll to bottom when new entries are added
    if (timelineRef.current) {
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
    }
  }, [entries.length]);

  if (!session) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="mx-auto mb-2" size={32} />
        <p>Start a timer to begin tracking your workflow</p>
      </div>
    );
  }

  const sessionStart = new Date(session.start_time).getTime();
  const sessionEnd = session.end_time ? new Date(session.end_time).getTime() : currentTime;
  const totalDuration = sessionEnd - sessionStart;

  // Sort entries by timestamp
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Calculate positions for each entry
  const timelineItems = sortedEntries.map((entry, index) => {
    const entryTime = new Date(entry.timestamp).getTime();
    const position = ((entryTime - sessionStart) / totalDuration) * 100;

    // Calculate time since previous entry
    let timeSincePrevious = 0;
    if (index > 0) {
      const prevTime = new Date(sortedEntries[index - 1].timestamp).getTime();
      timeSincePrevious = entryTime - prevTime;
    } else {
      timeSincePrevious = entryTime - sessionStart;
    }

    return {
      entry,
      position: Math.min(position, 100),
      timeSincePrevious,
    };
  });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Live Timeline</h2>
        <div className="text-sm text-gray-400">
          Session Duration: {formatDuration(totalDuration)}
        </div>
      </div>

      <div
        ref={timelineRef}
        className="flex-1 overflow-y-auto pr-2 space-y-0 relative"
        style={{ minHeight: '400px' }}
      >
        {/* Timeline line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-dark-border" />

        {/* Session start marker */}
        <div className="relative flex items-start mb-6">
          <div className="absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full bg-green-500 ring-4 ring-dark-bg z-10" />
          <div className="ml-12">
            <div className="text-xs text-gray-500">
              {new Date(session.start_time).toLocaleTimeString()}
            </div>
            <div className="text-sm text-green-500 font-medium">Session Started</div>
          </div>
        </div>

        {/* Timeline entries */}
        {timelineItems.map(({ entry, timeSincePrevious }) => {
          const colorClass = ACTIVITY_COLORS[entry.activity_type || 'Other'] || ACTIVITY_COLORS.Other;

          return (
            <div key={entry.id} className="relative mb-6">
              {/* Time gap indicator */}
              {timeSincePrevious > 0 && (
                <div className="ml-12 mb-2 text-xs text-gray-600">
                  ↓ {formatDuration(timeSincePrevious)} later
                </div>
              )}

              {/* Entry marker */}
              <div className="flex items-start">
                <div className={`absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full ${colorClass} ring-4 ring-dark-bg z-10`} />

                <div className="ml-12 flex-1">
                  <div className="bg-dark-surface border border-dark-border rounded-lg p-3 hover:border-gray-600 transition-colors">
                    <div className="flex items-start justify-between mb-2">
                      <div className="text-xs text-gray-500">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </div>
                      {entry.activity_type && (
                        <span className={`text-xs px-2 py-0.5 rounded text-white ${colorClass}`}>
                          {entry.activity_type}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-100 text-sm leading-relaxed">{entry.label}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Current time indicator (Now) */}
        {isRunning && (
          <div className="relative flex items-start animate-pulse">
            <div className="absolute left-6 -translate-x-1/2 w-4 h-4 rounded-full bg-blue-500 ring-4 ring-blue-500/20 z-10">
              <div className="absolute inset-0 rounded-full bg-blue-500 animate-ping opacity-75" />
            </div>
            <div className="ml-12">
              <div className="text-xs text-blue-400 font-medium">
                NOW - {new Date(currentTime).toLocaleTimeString()}
              </div>
              <div className="text-sm text-gray-400">Currently working...</div>
            </div>
          </div>
        )}

        {/* Session end marker */}
        {!isRunning && session.end_time && (
          <div className="relative flex items-start mt-6">
            <div className="absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 ring-4 ring-dark-bg z-10" />
            <div className="ml-12">
              <div className="text-xs text-gray-500">
                {new Date(session.end_time).toLocaleTimeString()}
              </div>
              <div className="text-sm text-red-500 font-medium">Session Ended</div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {sortedEntries.length === 0 && isRunning && (
          <div className="ml-12 text-center py-8 text-gray-500">
            <p className="text-sm">No timeline entries yet.</p>
            <p className="text-xs mt-1">Add your first note below to start tracking your workflow!</p>
          </div>
        )}
      </div>
    </div>
  );
}
