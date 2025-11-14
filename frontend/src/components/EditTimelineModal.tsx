import { useState, useEffect, useRef } from 'react';
import { X, Paperclip, Trash2, Tag } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { timelineApi } from '../services/api';
import type { TimelineEntry } from '../types';
import ImageLightbox from './ImageLightbox';
import { FILE_SIZE_LIMITS, FILE_MESSAGES, validateImageFile } from '../config/fileConfig';
import { ACTIVITY_TYPES, getActivityTypeColor } from '../constants/activityTypes';

interface EditTimelineModalProps {
  entry: TimelineEntry;
  onClose: () => void;
  onSave: (data: { label?: string; activityType?: string | null }) => void;
}

const MAX_IMAGES = FILE_SIZE_LIMITS.MAX_NOTE_IMAGES;

export default function EditTimelineModal({ entry, onClose, onSave }: EditTimelineModalProps) {
  const [label, setLabel] = useState(entry.label || '');
  const [selectedActivityType, setSelectedActivityType] = useState<string | null>(entry.activity_type || null);
  const [showActivityPicker, setShowActivityPicker] = useState(false);
  const [imageKeys, setImageKeys] = useState<string[]>(entry.image_urls || []);
  const [imagesToDelete, setImagesToDelete] = useState<string[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabel(entry.label || '');
    setSelectedActivityType(entry.activity_type || null);
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
    e.target.value = '';
  };

  const handleRemoveImage = (imageKey: string) => {
    setImageKeys(prev => prev.filter(key => key !== imageKey));
    setImagesToDelete(prev => [...prev, imageKey]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!label.trim() && imageKeys.length === 0) {
      alert('Timeline entry must have either text or images. To remove this entry completely, use the delete button.');
      return;
    }

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
      activityType: selectedActivityType || null,
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
              Note (Shift+Enter for new line)
            </label>
            <textarea
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input resize-none"
              rows={3}
              autoFocus
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-300">
                Activity Type
              </label>
              <button
                type="button"
                onClick={() => setShowActivityPicker(!showActivityPicker)}
                className="activity-picker-button btn-sm"
              >
                <Tag size={14} />
                <span className="text-xs">Set Activity</span>
              </button>
            </div>

            {showActivityPicker && (
              <div className="p-3 bg-dark-bg rounded border border-dark-border mb-2">
                <div className="grid grid-cols-2 gap-2">
                  {ACTIVITY_TYPES.map(activity => (
                    <button
                      key={activity.name}
                      type="button"
                      onClick={() => {
                        setSelectedActivityType(activity.name);
                        setShowActivityPicker(false);
                      }}
                      className={`px-3 py-1.5 rounded border-2 text-sm transition-all ${
                        selectedActivityType === activity.name
                          ? `${activity.borderColor} ${activity.bgColor} bg-opacity-20 text-gray-100`
                          : `${activity.borderColor} border-opacity-50 text-gray-400 hover:border-opacity-100`
                      }`}
                    >
                      {activity.label}
                    </button>
                  ))}
                  {selectedActivityType && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedActivityType(null);
                        setShowActivityPicker(false);
                      }}
                      className="px-3 py-1.5 rounded border-2 border-gray-500 text-sm text-gray-400 hover:border-opacity-100"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {selectedActivityType && !showActivityPicker && (
              <div className="flex flex-wrap gap-1">
                {(() => {
                  const activity = getActivityTypeColor(selectedActivityType);
                  if (!activity) return null;
                  return (
                    <span
                      key={selectedActivityType}
                      className={`px-2 py-0.5 text-xs rounded border ${activity.borderColor} ${activity.bgColor} bg-opacity-20 text-gray-300 flex items-center space-x-1`}
                    >
                      <span>{activity.label}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedActivityType(null)}
                        className="hover:text-white"
                      >
                        ×
                      </button>
                    </span>
                  );
                })()}
              </div>
            )}
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
