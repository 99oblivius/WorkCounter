import { X, Loader2 } from 'lucide-react';
import type { PendingImage } from '../types';

interface PendingImagePreviewProps {
  image: PendingImage;
  onRemove: (id: string) => void;
}

export default function PendingImagePreview({ image, onRemove }: PendingImagePreviewProps) {
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="relative group">
      {/* Image preview */}
      <div className="relative w-24 h-24 bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
        <img
          src={image.previewUrl}
          alt={image.file.name}
          className="w-full h-full object-cover"
        />

        {/* Processing/uploading overlay */}
        {(image.status === 'processing' || image.status === 'uploading') && (
          <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center">
            <Loader2 className="text-blue-400 animate-spin mb-1" size={20} />
            <span className="text-xs text-gray-300">
              {image.status === 'processing' ? 'Processing...' : `${image.progress}%`}
            </span>
          </div>
        )}

        {/* Error overlay */}
        {image.status === 'error' && (
          <div className="absolute inset-0 bg-red-900 bg-opacity-70 flex items-center justify-center">
            <span className="text-xs text-white text-center px-2">
              {image.error || 'Upload failed'}
            </span>
          </div>
        )}

        {/* Remove button - small X in top-right corner */}
        {image.status === 'ready' && (
          <button
            onClick={() => onRemove(image.id)}
            className="absolute top-1 right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remove image"
          >
            <X size={14} className="text-white" />
          </button>
        )}
      </div>

      {/* File info - only show for ready state */}
      {image.status === 'ready' && (
        <div className="mt-1 text-xs text-gray-500 truncate w-24" title={image.file.name}>
          {formatSize(image.file.size)}
        </div>
      )}
    </div>
  );
}
