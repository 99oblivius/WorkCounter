import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Tag } from 'lucide-react';
import { timelineApi } from '../services/api';

interface QuickNoteInputProps {
  workId: number;
  sessionId: number;
  onSuccess: () => void;
}

const ACTIVITY_TYPES = [
  'Development',
  'Design',
  'Meeting',
  'Research',
  'Review',
  'Testing',
  'Documentation',
  'Planning',
  'Bug Fix',
  'Other',
];

export default function QuickNoteInput({ workId, sessionId, onSuccess }: QuickNoteInputProps) {
  const [note, setNote] = useState('');
  const [activityType, setActivityType] = useState('');
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mutation = useMutation({
    mutationFn: async (data: { label: string; activityType?: string }) => {
      return timelineApi.create({
        timeSessionId: sessionId,
        workId,
        timestamp: new Date().toISOString(),
        label: data.label,
        activityType: data.activityType || undefined,
      });
    },
    onSuccess: () => {
      setNote('');
      setActivityType('');
      onSuccess();
      inputRef.current?.focus();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim()) return;

    mutation.mutate({
      label: note.trim(),
      activityType: activityType || undefined,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ctrl/Cmd + Enter to add activity type quickly
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      setShowActivityPicker(!showActivityPicker);
    }
  };

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div className="bg-dark-surface border border-dark-border rounded-lg p-4">
      <div className="flex items-center space-x-2 mb-3">
        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm text-gray-400 font-medium">Quick Note</span>
        <span className="text-xs text-gray-600">Press Enter to add</span>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex space-x-2">
          <input
            ref={inputRef}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="What are you working on right now?"
            className="input flex-1"
            disabled={mutation.isPending}
          />
          <button
            type="button"
            onClick={() => setShowActivityPicker(!showActivityPicker)}
            className={`btn btn-secondary px-3 ${activityType ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
            title="Set activity type (Ctrl+Enter)"
          >
            <Tag size={16} />
          </button>
          <button
            type="submit"
            disabled={!note.trim() || mutation.isPending}
            className="btn btn-primary px-4"
            title="Add note (Enter)"
          >
            <Send size={16} />
          </button>
        </div>

        {showActivityPicker && (
          <div className="flex flex-wrap gap-2 p-3 bg-dark-bg rounded border border-dark-border">
            <button
              type="button"
              onClick={() => {
                setActivityType('');
                setShowActivityPicker(false);
              }}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${
                !activityType
                  ? 'bg-gray-600 text-white'
                  : 'bg-dark-surface text-gray-400 hover:bg-dark-hover'
              }`}
            >
              None
            </button>
            {ACTIVITY_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setActivityType(type);
                  setShowActivityPicker(false);
                  inputRef.current?.focus();
                }}
                className={`text-xs px-3 py-1.5 rounded transition-colors ${
                  activityType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-dark-surface text-gray-400 hover:bg-dark-hover'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}

        {activityType && !showActivityPicker && (
          <div className="flex items-center space-x-2 text-xs">
            <Tag size={12} className="text-blue-400" />
            <span className="text-blue-400">Tagged as: {activityType}</span>
            <button
              type="button"
              onClick={() => setActivityType('')}
              className="text-gray-500 hover:text-gray-300 ml-1"
            >
              ✕
            </button>
          </div>
        )}

        {mutation.isError && (
          <p className="text-red-500 text-xs">Failed to add note. Please try again.</p>
        )}
      </form>

      <div className="mt-3 pt-3 border-t border-dark-border text-xs text-gray-600">
        <span>Tip: Press Ctrl+Enter to toggle activity type</span>
      </div>
    </div>
  );
}
