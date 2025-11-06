import { Download, Trash2, X, Loader2, AlertCircle } from 'lucide-react';
import FileTypeIcon from './FileIcon';
import { formatBytes, formatSpeed } from '../utils/format';
import type { FileStorageRecord } from '../types';

interface FileListItemProps {
  file: FileStorageRecord;
  uploadSpeed?: number; // bytes per second (only for uploading files)
  onDownload?: (fileId: number) => void;
  onDelete?: (fileId: number) => void;
  onCancel?: (fileId: number) => void;
}

/**
 * Minimalistic file list item - slim design matching session styling
 * Shows inline progress bar for uploading files
 */
export default function FileListItem({
  file,
  uploadSpeed = 0,
  onDownload,
  onDelete,
  onCancel,
}: FileListItemProps) {
  const isUploading = file.upload_status === 'uploading';
  const isCompleted = file.upload_status === 'completed';
  const isFailed = file.upload_status === 'failed';

  const handleDownload = () => {
    if (isCompleted && onDownload) {
      onDownload(file.id);
    }
  };

  const handleDelete = () => {
    if (onDelete && window.confirm(`Delete "${file.display_name}"?`)) {
      onDelete(file.id);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel(file.id);
    }
  };

  return (
    <div className="w-full bg-dark-bg border border-dark-border hover:border-gray-600 rounded p-2 text-xs transition-colors group relative">
      <div className="flex items-center space-x-3">
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

              {/* Action Buttons (only show on completed or failed) */}
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
                  {onDelete && (
                    <button
                      onClick={handleDelete}
                      className="p-1 hover:bg-dark-hover rounded text-gray-400 hover:text-red-400"
                      title="Delete"
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

          {/* File Size and Upload Date (for completed files) */}
          {isCompleted && (
            <p className="text-gray-500 mt-0.5">
              {formatBytes(file.file_size)}
              {file.uploaded_at && (
                <span> • {new Date(file.uploaded_at).toLocaleDateString()}</span>
              )}
            </p>
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
