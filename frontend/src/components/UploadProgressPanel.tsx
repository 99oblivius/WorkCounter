import React from 'react';
import { useUploadQueue } from '../stores/uploadQueueStore';
import { X, Pause, Play, RotateCcw, CheckCircle, XCircle, Loader2, AlertCircle, Minimize2 } from 'lucide-react';
import { formatBytes, formatSpeed, formatTime } from '../utils/format';

/**
 * Dropbox-inspired upload progress panel
 * - Shows all active uploads
 * - Real-time speed and ETA
 * - Pause/resume/cancel controls
 * - Minimizable
 */
export default function UploadProgressPanel() {
  const {
    uploads,
    getTotalProgress,
    isUploading,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    removeUpload,
    clearCompleted,
  } = useUploadQueue();

  const [isMinimized, setIsMinimized] = React.useState(false);

  const uploadArray = Array.from(uploads.values());
  const activeCount = uploadArray.filter((u) => u.status === 'uploading' || u.status === 'pending').length;
  const completedCount = uploadArray.filter((u) => u.status === 'completed').length;
  const failedCount = uploadArray.filter((u) => u.status === 'failed').length;

  // Don't show if no uploads
  if (uploadArray.length === 0) return null;

  // Calculate total speed and ETA for active uploads
  const activeUploads = uploadArray.filter((u) => u.status === 'uploading');
  const totalSpeed = activeUploads.reduce((sum, u) => sum + u.speed, 0);
  const totalRemaining = activeUploads.reduce((sum, u) => sum + (u.totalBytes - u.uploadedBytes), 0);
  const overallETA = totalSpeed > 0 ? Math.round(totalRemaining / totalSpeed) : 0;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-dark-border bg-dark-bg">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-100">
            {isUploading() ? 'Uploading files...' : 'Uploads'}
          </h3>
          <div className="flex items-center space-x-2 text-xs text-gray-400 mt-0.5">
            {activeCount > 0 && (
              <>
                <span className="text-blue-400">{activeCount} active</span>
                {totalSpeed > 0 && (
                  <>
                    <span>•</span>
                    <span>{formatSpeed(totalSpeed)}</span>
                    {overallETA > 0 && (
                      <>
                        <span>•</span>
                        <span>{formatTime(overallETA)} left</span>
                      </>
                    )}
                  </>
                )}
              </>
            )}
            {completedCount > 0 && <span className="text-green-400">{completedCount} done</span>}
            {failedCount > 0 && <span className="text-red-400">{failedCount} failed</span>}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              className="text-xs text-gray-400 hover:text-gray-200 px-2 py-1 hover:bg-dark-hover rounded"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-gray-200"
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            <Minimize2 size={14} className={isMinimized ? 'rotate-180' : ''} />
          </button>
        </div>
      </div>

      {/* Overall Progress Bar (when uploading) */}
      {!isMinimized && isUploading() && (
        <div className="p-3 border-b border-dark-border bg-dark-bg">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
            <span>Overall Progress</span>
            <span>{getTotalProgress()}%</span>
          </div>
          <div className="w-full bg-dark-surface rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${getTotalProgress()}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload List */}
      {!isMinimized && (
        <div className="max-h-96 overflow-y-auto">
          {uploadArray.map((upload) => (
            <UploadItem
              key={upload.id}
              upload={upload}
              onPause={() => pauseUpload(upload.id)}
              onResume={() => resumeUpload(upload.id)}
              onCancel={() => cancelUpload(upload.id)}
              onRetry={() => retryUpload(upload.id)}
              onRemove={() => removeUpload(upload.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface UploadItemProps {
  upload: any;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

function UploadItem({ upload, onPause, onResume, onCancel, onRetry, onRemove }: UploadItemProps) {
  const getStatusIcon = () => {
    switch (upload.status) {
      case 'uploading':
        return <Loader2 className="animate-spin text-blue-400" size={16} />;
      case 'pending':
        return <Loader2 className="text-gray-400" size={16} />;
      case 'completed':
        return <CheckCircle className="text-green-400" size={16} />;
      case 'failed':
        return <XCircle className="text-red-400" size={16} />;
      case 'paused':
        return <Pause className="text-yellow-400" size={16} />;
      case 'cancelled':
        return <AlertCircle className="text-gray-400" size={16} />;
      default:
        return <Loader2 className="text-gray-400" size={16} />;
    }
  };

  const showProgress = upload.status === 'uploading' || upload.status === 'pending';

  return (
    <div className="p-3 border-b border-dark-border hover:bg-dark-hover transition-colors">
      <div className="flex items-start space-x-3">
        {/* Status Icon */}
        <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 truncate font-medium">{upload.file.name}</p>

          {/* Status Text */}
          <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
            {upload.status === 'completed' && (
              <>
                <span className="text-green-400">Completed</span>
                <span>•</span>
                <span>{formatBytes(upload.totalBytes)}</span>
              </>
            )}

            {upload.status === 'uploading' && (
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

            {upload.status === 'pending' && (
              <>
                <span className="text-gray-500">Waiting...</span>
                <span>•</span>
                <span>{formatBytes(upload.totalBytes)}</span>
              </>
            )}

            {upload.status === 'paused' && (
              <>
                <span className="text-yellow-400">Paused</span>
                <span>•</span>
                <span>{upload.progress}% complete</span>
              </>
            )}

            {upload.status === 'failed' && (
              <>
                <span className="text-red-400">Failed</span>
                {upload.error && (
                  <>
                    <span>•</span>
                    <span className="truncate max-w-[200px]">{upload.error}</span>
                  </>
                )}
              </>
            )}

            {upload.status === 'cancelled' && <span className="text-gray-500">Cancelled</span>}
          </div>

          {/* Progress Bar */}
          {showProgress && (
            <div className="mt-2">
              <div className="w-full bg-dark-surface rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all duration-300 ${
                    upload.status === 'uploading' ? 'bg-blue-500' : 'bg-gray-500'
                  }`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 flex-shrink-0">
          {upload.status === 'uploading' && (
            <>
              <button
                onClick={onPause}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-yellow-400"
                title="Pause"
              >
                <Pause size={14} />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-red-400"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </>
          )}

          {upload.status === 'paused' && (
            <>
              <button
                onClick={onResume}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-green-400"
                title="Resume"
              >
                <Play size={14} />
              </button>
              <button
                onClick={onCancel}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-red-400"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </>
          )}

          {upload.status === 'pending' && (
            <button
              onClick={onCancel}
              className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-red-400"
              title="Cancel"
            >
              <X size={14} />
            </button>
          )}

          {upload.status === 'failed' && (
            <>
              <button
                onClick={onRetry}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-blue-400"
                title="Retry"
              >
                <RotateCcw size={14} />
              </button>
              <button
                onClick={onRemove}
                className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-red-400"
                title="Remove"
              >
                <X size={14} />
              </button>
            </>
          )}

          {(upload.status === 'completed' || upload.status === 'cancelled') && (
            <button
              onClick={onRemove}
              className="p-1.5 hover:bg-dark-surface rounded text-gray-400 hover:text-gray-200"
              title="Remove"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
