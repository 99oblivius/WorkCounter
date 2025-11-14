import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { timelineApi } from '../services/api';

interface TimelineFormProps {
  workId: number;
  sessionId: number;
  onClose: () => void;
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

export default function TimelineForm({ workId, sessionId, onClose, onSuccess }: TimelineFormProps) {
  const [formData, setFormData] = useState({
    label: '',
    activityType: '',
    timestamp: new Date().toISOString().slice(0, 16),
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return timelineApi.create({
        timeSessionId: sessionId,
        workId,
        timestamp: new Date(data.timestamp).toISOString(),
        label: data.label,
        activityType: data.activityType || undefined,
      });
    },
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter (without Shift) to submit
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
    // Shift+Enter will insert newline naturally
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="card max-w-lg w-full">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-100">Add Timeline Entry</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Timestamp
            </label>
            <input
              type="datetime-local"
              value={formData.timestamp}
              onChange={(e) => setFormData({ ...formData, timestamp: e.target.value })}
              required
              className="input"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Activity Type
            </label>
            <select
              value={formData.activityType}
              onChange={(e) => setFormData({ ...formData, activityType: e.target.value })}
              className="input"
            >
              <option value="">Select type (optional)</option>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Note * (Shift+Enter for new line)
            </label>
            <textarea
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              onKeyDown={handleKeyDown}
              required
              className="input resize-none"
              rows={3}
              placeholder="What did you work on?"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? 'Adding...' : 'Add Entry'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>

          {mutation.isError && (
            <p className="text-red-500 text-sm">
              Failed to add timeline entry. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
