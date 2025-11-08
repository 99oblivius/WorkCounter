import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Clock } from 'lucide-react';
import { sessionsApi } from '../services/api';
import type { TimeSession } from '../types';

interface EditSessionModalProps {
  session: TimeSession;
  onClose: () => void;
}

const colors = [
  { name: 'red', bg: 'bg-red-500', hover: 'hover:bg-red-600' },
  { name: 'orange', bg: 'bg-orange-500', hover: 'hover:bg-orange-600' },
  { name: 'yellow', bg: 'bg-yellow-500', hover: 'hover:bg-yellow-600' },
  { name: 'green', bg: 'bg-green-500', hover: 'hover:bg-green-600' },
  { name: 'blue', bg: 'bg-blue-500', hover: 'hover:bg-blue-600' },
  { name: 'purple', bg: 'bg-purple-500', hover: 'hover:bg-purple-600' },
  { name: 'pink', bg: 'bg-pink-500', hover: 'hover:bg-pink-600' },
  { name: 'gray', bg: 'bg-gray-500', hover: 'hover:bg-gray-600' },
];

export default function EditSessionModal({ session, onClose }: EditSessionModalProps) {
  const [title, setTitle] = useState(session.title || '');
  const [selectedColor, setSelectedColor] = useState<string | null>(session.color || null);
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: async () => {
      await sessionsApi.update(session.id, {
        title: title.trim() || null,
        color: selectedColor || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
      onClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-dark-surface border border-dark-border rounded-lg p-6 w-full max-w-md">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-100 flex items-center space-x-2">
            <Clock size={20} />
            <span>Edit Session</span>
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Title Input */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title (optional)
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Morning Sprint, Client Meeting"
              className="input w-full"
              maxLength={255}
            />
          </div>

          {/* Color Picker */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Color Tag (optional)
            </label>
            <div className="flex flex-wrap gap-2">
              {colors.map(color => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => setSelectedColor(color.name)}
                  className={`w-10 h-10 rounded ${color.bg} ${color.hover} ${
                    selectedColor === color.name ? 'ring-2 ring-white' : ''
                  }`}
                  title={color.name}
                />
              ))}
              {selectedColor && (
                <button
                  type="button"
                  onClick={() => setSelectedColor(null)}
                  className="w-10 h-10 rounded bg-gray-700 hover:bg-gray-600 flex items-center justify-center"
                  title="Clear color"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
