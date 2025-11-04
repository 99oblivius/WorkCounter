import { useUploadQueue } from '../stores/uploadQueueStore';
import { X, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { formatBytes, formatSpeed, formatTime } from '../utils/format';

/**
 * Inline upload progress component for FileStorageSection
 * Shows active uploads in a compact, integrated style
 */
export default function InlineUploadProgress() {
  const {
    uploads,
    cancelUpload,
    retryUpload,
    removeUpload,
  } = useUploadQueue();

  const uploadArray = Array.from(uploads.values());
  const activeUploads = uploadArray.filter(
    (u) => u.status === 'uploading' || u.status === 'pending'
  );
  const recentCompleted = uploadArray.filter(
    (u) => u.status === 'completed' && u.completedAt && Date.now() - u.completedAt < 5000
  );
  const failed = uploadArray.filter((u) => u.status === 'failed');

  const allDisplayed = [...activeUploads, ...recentCompleted, ...failed];

  if (allDisplayed.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {/* Header */}
      {activeUploads.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
          <span className="font-medium">
            Uploading {activeUploads.length} {activeUploads.length === 1 ? 'file' : 'files'}...
          </span>
        </div>
      )}

      {/* Upload items */}
      {allDisplayed.map((upload) => (
        <UploadItem
          key={upload.id}
          upload={upload}
          onCancel={() => cancelUpload(upload.id)}
          onRetry={() => retryUpload(upload.id)}
          onRemove={() => removeUpload(upload.id)}
        />
      ))}
    </div>
  );
}

interface UploadItemProps {
  upload: any;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

function UploadItem({ upload, onCancel, onRetry, onRemove }: UploadItemProps) {
  const isUploading = upload.status === 'uploading';
  const isPending = upload.status === 'pending';
  const isCompleted = upload.status === 'completed';
  const isFailed = upload.status === 'failed';

  const getStatusIcon = () => {
    if (isUploading) return <Loader2 className="animate-spin text-blue-400" size={16} />;
    if (isPending) return <Loader2 className="text-gray-400" size={16} />;
    if (isCompleted) return <CheckCircle className="text-green-400" size={16} />;
    if (isFailed) return <XCircle className="text-red-400" size={16} />;
    return null;
  };

  return (
    <div className="w-full bg-dark-bg border border-dark-border hover:border-gray-600 rounded p-3 text-xs transition-colors">
      <div className="flex items-start space-x-3">
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <p className="text-gray-300 truncate font-medium">{upload.file.name}</p>

            {/* Actions */}
            <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
              {(isUploading || isPending) && (
                <>
                  <span className="text-gray-400">
                    {upload.progress}%
                  </span>
                  <button
                    onClick={onCancel}
                    className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </>
              )}

              {isFailed && (
                <>
                  <button
                    onClick={onRetry}
                    className="text-blue-400 hover:text-blue-300 px-2 py-0.5"
                  >
                    Retry
                  </button>
                  <button
                    onClick={onRemove}
                    className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </>
              )}

              {isCompleted && (
                <span className="text-green-400 text-xs">✓ Complete</span>
              )}
            </div>
          </div>

          {/* Progress details */}
          <div className="flex items-center space-x-2 text-gray-500">
            {isPending && <span>Waiting in queue...</span>}

            {isUploading && (
              <>
                <span>{formatBytes(upload.uploadedBytes)} / {formatBytes(upload.totalBytes)}</span>
                {upload.speed > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatSpeed(upload.speed)}</span>
                  </>
                )}
                {upload.eta > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatTime(upload.eta)} left</span>
                  </>
                )}
              </>
            )}

            {isCompleted && (
              <span>{formatBytes(upload.totalBytes)}</span>
            )}

            {isFailed && upload.error && (
              <span className="text-red-400">{upload.error}</span>
            )}
          </div>

          {/* Progress Bar */}
          {(isUploading || isPending) && (
            <div className="mt-2">
              <div className="w-full bg-dark-surface rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all duration-300 ${
                    isUploading ? 'bg-blue-500' : 'bg-gray-500'
                  }`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
