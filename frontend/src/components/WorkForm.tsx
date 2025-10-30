import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { worksApi } from '../services/api';
import type { Work } from '../types';

interface WorkFormProps {
  work?: Work;
  onClose: () => void;
  onSuccess: () => void;
}

export default function WorkForm({ work, onClose, onSuccess }: WorkFormProps) {
  const [formData, setFormData] = useState({
    title: work?.title || '',
    description: work?.description || '',
    clientName: work?.client_name || '',
    hourlyRate: work?.hourly_rate?.toString() || '',
    tags: work?.tags?.join(', ') || '',
  });

  const mutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const payload = {
        title: data.title,
        description: data.description || undefined,
        clientName: data.clientName || undefined,
        hourlyRate: data.hourlyRate ? parseFloat(data.hourlyRate) : undefined,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
      };

      if (work) {
        return worksApi.update(work.id, payload);
      } else {
        return worksApi.create(payload);
      }
    },
    onSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-100">
            {work ? 'Edit Work' : 'Create New Work'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-100">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="input"
              placeholder="Project name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input"
              rows={3}
              placeholder="Brief description of the work"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Client Name
              </label>
              <input
                type="text"
                value={formData.clientName}
                onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                className="input"
                placeholder="Client or company name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Hourly Rate ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={formData.hourlyRate}
                onChange={(e) => setFormData({ ...formData, hourlyRate: e.target.value })}
                className="input"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Tags
            </label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              className="input"
              placeholder="development, design, consulting (comma-separated)"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? 'Saving...' : work ? 'Update Work' : 'Create Work'}
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
              Failed to save work. Please try again.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
