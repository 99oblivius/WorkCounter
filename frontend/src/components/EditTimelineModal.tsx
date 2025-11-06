import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Trash2 } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { timelineApi } from '../services/api';
import type { TimelineEntry } from '../types';
import ImageLightbox from './ImageLightbox';
import { FILE_SIZE_LIMITS, FILE_MESSAGES, validateImageFile } from '../config/fileConfig';

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

const MAX_IMAGES = FILE_SIZE_LIMITS.MAX_NOTE_IMAGES;

export default function EditTimelineModal({ entry, onClose, onSave }: EditTimelineModalProps) {
  const [label, setLabel] = useState(entry.label || '');
  const [activityType, setActivityType] = useState(entry.activity_type || '');
  const [imageKeys, setImageKeys] = useState<string[]>(entry.image_urls || []);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(entry.label || '');
    setActivityType(entry.activity_type || '');
    setImageKeys(entry.image_urls || []);
    setImagesToDelete([]);
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
      const validation = validateImageFile(file);
      if (!validation.valid) {
        alert(validation.error);
        return false;
      }
      return true;
    });

    if (imageKeys.length + validFiles.length > MAX_IMAGES) {
      alert(FILE_MESSAGES.MAX_IMAGES_REACHED(MAX_IMAGES));
      return;
    }

    uploadMutation.mutate(validFiles);
    e.target.value = ''; // Reset input
  };

  // Mark image for deletion (staged until save)
  const handleRemoveImage = (imageKey: string) => {
    setImageKeys(prev => prev.filter(key => key !== imageKey));
    setImagesToDelete(prev => [...prev, imageKey]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Require at least label or images remaining (can't have completely empty entry)
    if (!label.trim() && imageKeys.length === 0) {
      alert('Timeline entry must have either text or images. To remove this entry completely, use the delete button.');
      return;
    }

    // Delete removed images
    if (imagesToDelete.length > 0) {
      try {
        await Promise.all(
          imagesToDelete.map(imageKey =>
            timelineApi.deleteImage(entry.id, imageKey)
          )
        );
      } catch (error) {
        console.error('Failed to delete some images:', error);
        alert('Failed to delete some images. Changes to text will still be saved.');
      }
    }

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
              <div className="grid grid-cols-3 gap-2 mt-2">
                {imageKeys.map((imageKey, index) => (
                  <div
                    key={imageKey}
                    className="relative group cursor-pointer overflow-hidden rounded-lg border border-dark-border bg-dark-surface aspect-square"
                    onClick={() => setLightboxIndex(index)}
                  >
                    <img
                      src={timelineApi.getImageUrl(imageKey)}
                      alt={`Image ${index + 1}`}
                      className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                    {/* Remove button - changes staged until save */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveImage(imageKey);
                      }}
                      className="absolute top-1 right-1 w-6 h-6 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      title="Remove image (will delete on save)"
                    >
                      <Trash2 size={14} className="text-white" />
                    </button>
                    <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" />
                  </div>
                ))}
              </div>
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

          {/* Lightbox for image preview */}
          {lightboxIndex !== null && (
            <ImageLightbox
              images={imageKeys.map(key => timelineApi.getImageUrl(key))}
              initialIndex={lightboxIndex}
              onClose={() => setLightboxIndex(null)}
            />
          )}

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
              disabled={!label.trim() && imageKeys.length === 0 && imagesToDelete.length === 0}
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
