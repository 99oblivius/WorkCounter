import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { TimelineEntry } from '../types';

interface EditTimelineModalProps {
  entry: TimelineEntry;
  onClose: () => void;
  onSave: (data: { label: string; activityType?: string | null }) => void;
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

export default function EditTimelineModal({ entry, onClose, onSave }: EditTimelineModalProps) {
  const [label, setLabel] = useState(entry.label);
  const [activityType, setActivityType] = useState(entry.activity_type || '');

  useEffect(() => {
    setLabel(entry.label);
    setActivityType(entry.activity_type || '');
  }, [entry]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;

    onSave({
      label: label.trim(),
      activityType: activityType || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-100">Edit Note</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Note
            </label>
            <textarea
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="input"
              rows={3}
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Activity Type
            </label>
            <select
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
              className="input"
            >
              <option value="">None</option>
              {ACTIVITY_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!label.trim()}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
