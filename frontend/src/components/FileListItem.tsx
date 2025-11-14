import { Download, Trash2, X, Loader2, AlertCircle, Users } from 'lucide-react';
import FileTypeIcon from './FileIcon';
import { formatBytes, formatSpeed } from '../utils/format';
import type { FileStorageRecord } from '../types';
import type { DownloadItem } from '../stores/downloadQueueStore';

interface FileListItemProps {
  file: FileStorageRecord;
  currentUserId?: number; // For showing file ownership
  uploadSpeed?: number; // bytes per second (only for uploading files)
  onDownload?: (fileId: number) => void;
  onDelete?: (fileId: number) => void;
  onConfirmDelete?: (fileId: number, event?: React.MouseEvent) => Promise<void>; // Async confirm + delete
  onCancel?: (fileId: number) => void;
  downloadState?: DownloadItem; // Current download state for this file
}

/**
 * Minimalistic file list item - slim design matching session styling
 * Shows inline progress bar for uploading files
 */
export default function FileListItem({
  file,
  currentUserId,
  uploadSpeed = 0,
  onDownload,
  onDelete,
  onConfirmDelete,
  onCancel,
  downloadState,
}: FileListItemProps) {
  const isUploading = file.upload_status === 'uploading';
  const isCompleted = file.upload_status === 'completed';
  const isFailed = file.upload_status === 'failed';

  // Download states
  const isDownloading = downloadState?.status === 'downloading';
  const downloadFailed = downloadState?.status === 'failed';
  const downloadCompleted = downloadState?.status === 'completed';

  const handleDownload = () => {
    if (isCompleted && onDownload && !isDownloading) {
      onDownload(file.id);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    // Use async confirm if available, otherwise fallback to sync
    if (onConfirmDelete) {
      onConfirmDelete(file.id, e);
    } else if (onDelete && window.confirm(`Delete "${file.display_name}"?`)) {
      onDelete(file.id);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel(file.id);
    }
  };

  // Format download speed for display
  const formatDownloadSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return '';
    if (bytesPerSecond < 1024) return `${bytesPerSecond.toFixed(0)} B/s`;
    if (bytesPerSecond < 1024 * 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  };

  return (
    <div className="w-full bg-dark-bg border border-dark-border hover:border-gray-600 rounded p-2 text-xs transition-colors group relative overflow-hidden">
      {/* Download progress overlay - fills from left to right */}
      {isDownloading && downloadState && (
        <div
          className="absolute inset-0 bg-blue-500 bg-opacity-10 transition-all duration-300 pointer-events-none"
          style={{ width: `${downloadState.progress}%` }}
        />
      )}

      {/* Completed flash - brief green overlay */}
      {downloadCompleted && (
        <div
          className="absolute inset-0 bg-green-500 bg-opacity-20 pointer-events-none animate-fade-out"
        />
      )}

      {/* Failed flash - brief red overlay */}
      {downloadFailed && (
        <div
          className="absolute inset-0 bg-red-500 bg-opacity-20 pointer-events-none animate-fade-out"
        />
      )}

      <div className="flex items-center space-x-3 relative z-10">
        {/* File Icon */}
        <FileTypeIcon
          filename={file.display_name}
          mimeType={file.mime_type}
          className="text-gray-400 flex-shrink-0"
          size={20}
        />

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-gray-300 truncate pr-2">{file.display_name}</p>

            {/* Status Icons */}
            <div className="flex items-center space-x-2 flex-shrink-0">
              {isUploading && (
                <div className="flex items-center space-x-1 text-gray-400">
                  <Loader2 size={14} className="animate-spin" />
                  <span>{file.upload_progress}%</span>
                  {uploadSpeed > 0 && (
                    <span className="text-gray-500">• {formatSpeed(uploadSpeed)}</span>
                  )}
                </div>
              )}

              {isFailed && (
                <div className="flex items-center space-x-1 text-red-400">
                  <AlertCircle size={14} />
                  <span>Failed</span>
                </div>
              )}

              {/* Action Buttons (only show on completed files) */}
              {isCompleted && (
                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onDownload && (
                    <button
                      onClick={handleDownload}
                      className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-blue-400"
                      title="Download"
                    >
                      <Download size={14} />
                    </button>
                  )}
                  {(onConfirmDelete || onDelete) && (
                    <button
                      onClick={handleDelete}
                      className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                      title="Delete file (Shift+Click to skip confirmation)"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* Cancel button for uploading files */}
              {isUploading && onCancel && (
                <button
                  onClick={handleCancel}
                  className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                  title="Cancel upload"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Download progress info (when downloading) */}
          {isDownloading && downloadState && (
            <div className="mt-0.5 text-gray-400">
              {formatBytes(downloadState.downloadedBytes)} of {formatBytes(downloadState.fileSize)}
              {downloadState.downloadSpeed > 0 && (
                <span> • {formatDownloadSpeed(downloadState.downloadSpeed)}</span>
              )}
              <span className="text-blue-400 ml-1">• {downloadState.progress}%</span>
            </div>
          )}

          {/* Download error (when failed) */}
          {downloadFailed && downloadState && (
            <div className="mt-0.5 text-red-400">
              {downloadState.error || 'Download failed'}
            </div>
          )}

          {/* File Size, Upload Date, and Username (for completed files, when not downloading or failed) */}
          {isCompleted && !isDownloading && !downloadFailed && (
            <div className="mt-0.5 flex items-center gap-2 flex-wrap">
              <p className="text-gray-500">
                {formatBytes(file.file_size)}
                {file.uploaded_at && (
                  <span> • {new Date(file.uploaded_at).toLocaleDateString()}</span>
                )}
              </p>
              {currentUserId && file.user_id !== currentUserId && file.username && (
                <div className="flex items-center space-x-1 text-xs text-gray-400 bg-gray-500 bg-opacity-10 px-2 py-0.5 rounded">
                  <Users size={10} />
                  <span>by {file.username}</span>
                </div>
              )}
            </div>
          )}

          {/* Progress Bar (for uploading files) */}
          {isUploading && (
            <div className="mt-1.5">
              <div className="w-full bg-dark-surface rounded-full h-1">
                <div
                  className="bg-blue-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${file.upload_progress}%` }}
                />
              </div>
              <p className="text-gray-500 mt-0.5">
                {formatBytes(file.uploaded_bytes)} / {formatBytes(file.file_size)}
              </p>
            </div>
          )}

          {/* Error Message (for failed files) */}
          {isFailed && file.error_message && (
            <p className="text-red-400 mt-0.5">{file.error_message}</p>
          )}
        </div>
      </div>
    </div>
  );
}
