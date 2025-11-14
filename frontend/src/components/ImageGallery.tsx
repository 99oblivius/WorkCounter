import { useState } from 'react';
import { timelineApi } from '../services/api';
import ImageLightbox from './ImageLightbox';

interface ImageGalleryProps {
  imageKeys: string[];
  className?: string;
}

export default function ImageGallery({ imageKeys, className = '' }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!imageKeys || imageKeys.length === 0) return null;

  // Determine grid layout based on image count (up to 3x3 grid)
  const getGridClass = () => {
    if (imageKeys.length === 1) return 'grid-cols-1';
    // 2-9 images: Always use 3 columns for consistent sizing
    return 'grid-cols-3';
  };

  return (
    <>
      <div className={`grid ${getGridClass()} gap-2 mt-2 ${className}`}>
        {imageKeys.map((imageKey, index) => (
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

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity pointer-events-none" />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <ImageLightbox
          images={imageKeys.map(key => timelineApi.getImageUrl(key))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
