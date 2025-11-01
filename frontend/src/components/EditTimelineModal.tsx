import { useState, useEffect, useRef } from 'react';
import { X, Paperclip } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { timelineApi } from '../services/api';
import type { TimelineEntry } from '../types';
import ImageGallery from './ImageGallery';

interface EditTimelineModalProps {
  entry: TimelineEntry;
  onClose: () => void;
  onSave: (data: { label?: string; activityType?: string | null }) => void;
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

const MAX_IMAGES = 9;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export default function EditTimelineModal({ entry, onClose, onSave }: EditTimelineModalProps) {
  const [label, setLabel] = useState(entry.label || '');
  const [activityType, setActivityType] = useState(entry.activity_type || '');
  const [imageKeys, setImageKeys] = useState<string[]>(entry.image_urls || []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(entry.label || '');
    setActivityType(entry.activity_type || '');
    setImageKeys(entry.image_urls || []);
  }, [entry]);

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const response = await timelineApi.uploadImages(entry.id, files);
      return response.data;
    },
    onSuccess: (data) => {
      setImageKeys(data.image_urls || []);
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate files
    const validFiles = files.filter(file => {
      if (!file.type.startsWith('image/')) {
        alert(`${file.name} is not an image`);
        return false;
      }
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} exceeds 5MB limit`);
        return false;
      }
      return true;
    });

    if (imageKeys.length + validFiles.length > MAX_IMAGES) {
      alert(`Maximum ${MAX_IMAGES} images allowed`);
      return;
    }

    uploadMutation.mutate(validFiles);
    e.target.value = ''; // Reset input
  };

  const handleImageDeleted = (deletedKey: string) => {
    setImageKeys(prev => prev.filter(key => key !== deletedKey));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Require at least label or images
    if (!label.trim() && imageKeys.length === 0) return;

    onSave({
      label: label.trim() || undefined,
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

          {/* Images section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Images {imageKeys.length > 0 && `(${imageKeys.length}/${MAX_IMAGES})`}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending || imageKeys.length >= MAX_IMAGES}
                className="btn btn-secondary btn-sm flex items-center space-x-1"
              >
                <Paperclip size={14} />
                <span>Add Images</span>
              </button>
            </div>

            {imageKeys.length > 0 && (
              <ImageGallery
                imageKeys={imageKeys}
                entryId={entry.id}
                onImageDeleted={handleImageDeleted}
              />
            )}

            {uploadMutation.isPending && (
              <p className="text-xs text-blue-400 mt-2">Uploading images...</p>
            )}
            {uploadMutation.isError && (
              <p className="text-xs text-red-400 mt-2">Failed to upload images. Please try again.</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileSelect}
              className="hidden"
            />
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
              disabled={!label.trim() && imageKeys.length === 0}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
