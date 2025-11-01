import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { timelineApi } from '../services/api';
import ImageLightbox from './ImageLightbox';

interface ImageGalleryProps {
  imageKeys: string[];
  entryId?: number; // If provided, show delete button
  onImageDeleted?: (imageKey: string) => void;
  className?: string;
}

export default function ImageGallery({ imageKeys, entryId, onImageDeleted, className = '' }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [localImageKeys, setLocalImageKeys] = useState(imageKeys);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async (imageKey: string) => {
      if (!entryId) throw new Error('No entry ID');
      return timelineApi.deleteImage(entryId, imageKey);
    },
    onMutate: async (imageKey: string) => {
      // Optimistically update UI
      setLocalImageKeys(prev => prev.filter(key => key !== imageKey));
      onImageDeleted?.(imageKey);
    },
    onSuccess: () => {
      // Invalidate queries to refetch
      queryClient.invalidateQueries({ queryKey: ['timeline'] });
    },
    onError: (error) => {
      console.error('Failed to delete image:', error);
      // Revert optimistic update
      setLocalImageKeys(imageKeys);
      alert('Failed to delete image. Please try again.');
    },
  });

  // Update local state when props change
  useEffect(() => {
    setLocalImageKeys(imageKeys);
  }, [imageKeys]);

  if (!localImageKeys || localImageKeys.length === 0) return null;

  const handleDelete = async (imageKey: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent lightbox from opening

    if (!entryId) return;

    if (!window.confirm('Delete this image?')) return;

    deleteMutation.mutate(imageKey);
  };

  // Determine grid layout based on image count (up to 3x3 grid)
  const getGridClass = () => {
    if (localImageKeys.length === 1) return 'grid-cols-1';
    // 2-9 images: Always use 3 columns for consistent sizing
    return 'grid-cols-3';
  };

  return (
    <>
      <div className={`grid ${getGridClass()} gap-2 mt-2 ${className}`}>
        {localImageKeys.map((imageKey, index) => (
          <div
            key={imageKey}
            className="relative group cursor-pointer overflow-hidden rounded-lg border border-dark-border bg-dark-surface aspect-square max-w-xs max-h-xs"
            onClick={() => setLightboxIndex(index)}
          >
            {/* Image */}
            <img
              src={timelineApi.getImageUrl(imageKey)}
              alt={`Image ${index + 1}`}
              className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />

            {/* Delete button - small X in top-right corner (only for editable entries) */}
            {entryId && (
              <button
                onClick={(e) => handleDelete(imageKey, e)}
                disabled={deleteMutation.isPending}
                className="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 disabled:bg-gray-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Delete image"
              >
                {deleteMutation.isPending ? (
                  <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <X size={14} className="text-white" />
                )}
              </button>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={localImageKeys.map(key => timelineApi.getImageUrl(key))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
