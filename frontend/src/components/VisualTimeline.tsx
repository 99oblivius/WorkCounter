import { useEffect, useRef, useState } from 'react';
import { Clock, Edit2, Trash2, Users } from 'lucide-react';
import { formatDuration } from '../hooks/useTimer';
import type { TimelineEntry, TimeSession } from '../types';
import ImageGallery from './ImageGallery';
import { getActivityTypeColor } from '../constants/activityTypes';

interface VisualTimelineProps {
  entries: TimelineEntry[];
  sessions: TimeSession[];
  runningSession: TimeSession | null;
  scrollToSessionId: number | null;
  currentUserId?: number; // For showing session ownership
  onEditEntry?: (entry: TimelineEntry) => void;
  onDeleteEntry?: (entryId: number) => void;
  onConfirmDeleteEntry?: (entryId: number, event?: React.MouseEvent) => Promise<void>; // Async confirm + delete
  canEditEntry?: (entry: TimelineEntry) => boolean;
  canDeleteEntry?: (entry: TimelineEntry) => boolean;
}

type TimelineItem =
  | { type: 'session-start'; session: TimeSession; timestamp: number }
  | { type: 'entry'; entry: TimelineEntry; timestamp: number }
  | { type: 'session-end'; session: TimeSession; timestamp: number }
  | { type: 'now'; timestamp: number };


export default function VisualTimeline({ entries, sessions, runningSession, scrollToSessionId, currentUserId, onEditEntry, onDeleteEntry, onConfirmDeleteEntry, canEditEntry, canDeleteEntry }: VisualTimelineProps) {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const timelineRef = useRef<HTMLDivElement>(null);
  const sessionRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!runningSession) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [runningSession]);

  useEffect(() => {
    if (scrollToSessionId && sessionRefs.current.has(scrollToSessionId)) {
      const element = sessionRefs.current.get(scrollToSessionId);
      element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [scrollToSessionId]);

  if (sessions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Clock className="mx-auto mb-2" size={32} />
        <p>Start a timer to begin tracking your workflow</p>
      </div>
    );
  }

  // Build unified timeline: merge entries with session start/end markers
  const buildUnifiedTimeline = (): TimelineItem[] => {
    const items: TimelineItem[] = [];

    const sortedSessions = [...sessions].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    sortedSessions.forEach((session) => {
      items.push({
        type: 'session-start',
        session,
        timestamp: new Date(session.start_time).getTime(),
      });

      const sessionEntries = entries
        .filter((entry) => entry.time_session_id === session.id)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      sessionEntries.forEach((entry) => {
        items.push({
          type: 'entry',
          entry,
          timestamp: new Date(entry.timestamp).getTime(),
        });
      });

      if (session.end_time) {
        items.push({
          type: 'session-end',
          session,
          timestamp: new Date(session.end_time).getTime(),
        });
      }
    });

    if (runningSession) {
      items.push({
        type: 'now',
        timestamp: currentTime,
      });
    }

    return items;
  };

  const timelineItems = buildUnifiedTimeline();
  const reversedItems = [...timelineItems].reverse();

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-100">Continuous Timeline</h2>
        <div className="text-sm text-gray-400">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''} • {entries.length} note{entries.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div
        ref={timelineRef}
        className="flex-1 overflow-y-auto pr-2 space-y-0 relative scrollbar-hide"
        style={{ minHeight: '400px' }}
      >
        {/* Render all timeline items */}
        {reversedItems.map((item, index) => {
          // Helper function to get session ID
          const getSessionId = (itm: TimelineItem) => {
            if (itm.type === 'session-start' || itm.type === 'session-end') return itm.session.id;
            if (itm.type === 'entry') return itm.entry.time_session_id;
            if (itm.type === 'now') return runningSession?.id;
            return null;
          };

          const nextItem = index < reversedItems.length - 1 ? reversedItems[index + 1] : null;
          const currentSessionId = getSessionId(item);
          const nextSessionId = nextItem ? getSessionId(nextItem) : null;
          const shouldDrawLineDown = currentSessionId && nextSessionId && currentSessionId === nextSessionId;

          if (item.type === 'session-start') {
            return (
              <div
                key={`session-start-${item.session.id}`}
                className="relative mb-8"
              >
                {/* Line connecting down to next item */}
                {shouldDrawLineDown && (
                  <div className="absolute left-6 top-[0.625rem] -bottom-8 w-0.5 bg-dark-border -translate-x-1/2" />
                )}

                <div className="flex items-start">
                  {/* Color indicator or default green */}
                  <div className={`absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full ${item.session.color ? `bg-${item.session.color}-500` : 'bg-green-500'} ring-4 ring-dark-bg z-10`} />
                  <div className="ml-12 flex-1">
                    <div className="p-3">
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(item.session.start_time).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm text-green-500 font-medium">
                          Session Started {item.session.is_running && '🟢'}
                        </div>
                        {item.session.title && (
                          <span className="text-sm font-medium text-gray-100">
                            {item.session.title}
                          </span>
                        )}
                        {currentUserId && item.session.user_id !== currentUserId && item.session.username && (
                          <div className="flex items-center space-x-1 text-xs text-gray-400 bg-gray-500 bg-opacity-10 px-2 py-0.5 rounded">
                            <Users size={10} />
                            <span>by {item.session.username}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'entry') {
            const activityColor = getActivityTypeColor(item.entry.activity_type);
            const colorClass = activityColor ? activityColor.bgColor : 'bg-gray-500';

            return (
              <div key={`entry-${item.entry.id}`} className="relative mb-8">
                {/* Line connecting down to next item */}
                {shouldDrawLineDown && (
                  <div className="absolute left-6 top-[0.625rem] -bottom-8 w-0.5 bg-dark-border -translate-x-1/2" />
                )}

                {/* Entry marker */}
                <div className="flex items-start group">
                  <div className={`absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full ${colorClass} ring-4 ring-dark-bg z-10`} />

                  <div className="ml-12 flex-1">
                    <div className="bg-dark-surface border border-dark-border rounded-lg p-3 hover:border-gray-600 transition-colors relative">
                      {/* Edit/Delete buttons - absolutely positioned */}
                      <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                        {onEditEntry && canEditEntry && canEditEntry(item.entry) && (
                          <button
                            onClick={() => onEditEntry(item.entry)}
                            className="p-1 bg-dark-surface hover:bg-dark-hover rounded text-gray-400 hover:text-accent-light border border-dark-border"
                            title="Edit note"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {(onConfirmDeleteEntry || onDeleteEntry) && canDeleteEntry && canDeleteEntry(item.entry) && (
                          <button
                            onClick={(e) => {
                              // Use async confirm if available, otherwise fallback to sync
                              if (onConfirmDeleteEntry) {
                                onConfirmDeleteEntry(item.entry.id, e);
                              } else if (onDeleteEntry && window.confirm('Delete this note?')) {
                                onDeleteEntry(item.entry.id);
                              }
                            }}
                            className="p-1 bg-dark-surface hover:bg-dark-hover rounded text-gray-400 hover:text-red-400 border border-dark-border"
                            title="Delete note (Shift+Click to skip confirmation)"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>

                      <div className="flex items-start justify-between mb-2 gap-2">
                        <div className="text-xs text-gray-500 flex-shrink-0">
                          {new Date(item.entry.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {item.entry.activity_type && activityColor && (
                            <span className={`text-xs px-2 py-0.5 rounded border ${activityColor.borderColor} ${activityColor.bgColor} bg-opacity-20 text-gray-300`}>
                              {activityColor.label}
                            </span>
                          )}
                        </div>
                      </div>
                      {item.entry.label && (
                        <p className="text-gray-100 text-sm leading-relaxed mb-2 whitespace-pre-wrap">{item.entry.label}</p>
                      )}
                      {item.entry.image_urls && item.entry.image_urls.length > 0 && (
                        <ImageGallery
                          imageKeys={item.entry.image_urls}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'session-end') {
            const duration = item.session.duration_ms || 0;

            return (
              <div
                key={`session-end-${item.session.id}`}
                ref={(el) => {
                  if (el) sessionRefs.current.set(item.session.id, el);
                }}
                className="relative mb-8"
              >
                {/* Line connecting down to next item */}
                {shouldDrawLineDown && (
                  <div className="absolute left-6 top-[0.625rem] -bottom-8 w-0.5 bg-dark-border -translate-x-1/2" />
                )}

                <div className="flex items-start">
                  <div className="absolute left-6 -translate-x-1/2 w-3 h-3 rounded-full bg-red-500 ring-4 ring-dark-bg z-10" />
                  <div className="ml-12 flex-1">
                    <div className="p-3">
                      <div className="text-xs text-gray-500 mb-1">
                        {new Date(item.session.end_time!).toLocaleTimeString()}
                      </div>
                      <div className="text-sm text-red-500 font-medium">
                        Session Ended • {formatDuration(duration)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          if (item.type === 'now') {
            return (
              <div key="now" className="relative mb-8">
                {/* Line connecting down to next item */}
                {shouldDrawLineDown && (
                  <div className="absolute left-6 top-[0.75rem] -bottom-8 w-0.5 bg-dark-border -translate-x-1/2" />
                )}

                <div className="flex items-start animate-pulse">
                  <div className="absolute left-6 -translate-x-1/2 w-4 h-4 rounded-full bg-accent ring-4 ring-accent/20 z-10">
                    <div className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
                  </div>
                  <div className="ml-12">
                    <div className="text-xs text-accent-light font-medium mb-1">
                      NOW - {new Date(currentTime).toLocaleTimeString()}
                    </div>
                    <div className="text-sm text-gray-400">Currently working...</div>
                  </div>
                </div>
              </div>
            );
          }

          return null;
        })}

        {/* Empty state */}
        {entries.length === 0 && sessions.length > 0 && (
          <div className="ml-12 text-center py-8 text-gray-500">
            <p className="text-sm">No timeline entries yet.</p>
            <p className="text-xs mt-1">Add your first note to start tracking your workflow!</p>
          </div>
        )}
      </div>
    </div>
  );
}
