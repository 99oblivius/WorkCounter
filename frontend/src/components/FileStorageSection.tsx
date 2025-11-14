import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import FileListItem from './FileListItem';
import InlineUploadProgress from './InlineUploadProgress';
import ZippingNotification from './ZippingNotification';
import { filesApi, API_URL } from '../services/api';
import { useFileUpload } from '../hooks/useFileUpload';
import { useUserPermissions } from '../hooks/useUserPermissions';
import { useConfirm } from '../hooks/useConfirm';
import { useZippingQueue } from '../stores/zippingQueueStore';
import { useDownloadQueue } from '../stores/downloadQueueStore';
import {
  isFolderSupported,
  processDataTransferItems,
  zipFolder,
  FolderZipError,
} from '../utils/folderZip';
import type { FileStorageRecord } from '../types';

interface FileStorageSectionProps {
  workId: number;
  userId: number;
  canCreate?: boolean;
  canDeleteResource?: (resourceUserId: number) => boolean;
}

export default function FileStorageSection({
  workId,
  userId,
  canCreate = false,
  canDeleteResource
}: FileStorageSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Non-blocking confirmation dialogs
  const { confirm, ConfirmDialog } = useConfirm();

  // Check user permissions for file uploads
  const { can, limits, isLoading: permissionsLoading } = useUserPermissions();

  const { queueFiles } = useFileUpload(workId, userId);
  const { addZipping, updateProgress, setCompleted, setFailed } = useZippingQueue();
  const { downloads, addDownload, updateProgress: updateDownloadProgress, setCompleted: setDownloadCompleted, setFailed: setDownloadFailed } = useDownloadQueue();

  // ALL HOOKS MUST BE CALLED BEFORE ANY CONDITIONAL RETURNS
  // No polling - uploads update via queue invalidation
  const { data: filesResponse } = useQuery({
    queryKey: ['files', 'work', workId],
    queryFn: async () => {
      const response = await filesApi.getByWorkId(workId);
      // Backend returns paginated response { data, hasMore, cursor }
      return response.data;
    },
    refetchInterval: false,
  });

  // Safely extract files array from paginated response or SSE-cached structure
  // SSE caches it as { data: [], hasMore, cursor }, API returns same structure
  const files = filesResponse?.data || [];

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => filesApi.delete(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
    },
  });

  const handleConfirmDelete = async (fileId: number, event?: React.MouseEvent) => {
    const file = files.find((f: FileStorageRecord) => f.id === fileId);
    if (!file) return;

    // Shift-click bypasses confirmation for power users
    if (event?.shiftKey) {
      deleteMutation.mutate(fileId);
      return;
    }

    const confirmed = await confirm({
      title: 'Delete File?',
      message: `This will permanently delete "${file.display_name}". This action cannot be undone.`,
      confirmLabel: 'Delete File',
      variant: 'danger',
    });

    if (confirmed) {
      deleteMutation.mutate(fileId);
    }
  };

  // Drag counter prevents flickering when dragging over child elements
  const dragCounterRef = useRef(0);

  // NOW safe to do conditional returns - all hooks have been called
  if (permissionsLoading) {
    return <div className="text-gray-500 text-sm">Loading...</div>;
  }

  // User can upload if they have BOTH:
  // 1. Global files.upload permission (can.uploadFiles)
  // 2. Create access to this specific work (Editor+)
  const canUpload = canCreate && can.uploadFiles;

  // Show files section for viewing/downloading even without upload permission
  // Upload controls only shown if canUpload is true

  const handleDownload = async (fileId: number) => {
    const file = files.find((f: FileStorageRecord) => f.id === fileId);
    if (!file) {
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

    addDownload(fileId, file.display_name, file.file_size, controller);

    try {
      const response = await fetch(`${API_URL}/api/files/${fileId}/download`, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('File not found');
        } else if (response.status === 403) {
          throw new Error('Access denied');
        } else if (response.status === 429) {
          throw new Error('Too many downloads, please wait');
        } else if (response.status >= 500) {
          throw new Error('Server error - please try again');
        }
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Response body is not readable');
      }

      const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
      if (!contentLength) {
        throw new Error('Content-Length header missing');
      }

      let receivedBytes = 0;
      const chunks: Uint8Array[] = [];
      const startTime = Date.now();
      let lastUpdateTime = startTime;
      let lastReceivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        if (value) {
          chunks.push(value);
          receivedBytes += value.length;
        }

        const now = Date.now();
        const timeDiff = now - lastUpdateTime;
        if (timeDiff >= 500) {
          const bytesDiff = receivedBytes - lastReceivedBytes;
          const speed = (bytesDiff / timeDiff) * 1000;
          updateDownloadProgress(fileId, receivedBytes, speed);
          lastUpdateTime = now;
          lastReceivedBytes = receivedBytes;
        }
      }

      updateDownloadProgress(fileId, receivedBytes, 0);

      const blob = new Blob(chunks as BlobPart[], {
        type: response.headers.get('Content-Type') || 'application/octet-stream',
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.display_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setDownloadCompleted(fileId);

    } catch (error: any) {
      clearTimeout(timeoutId);
      console.error(`[Download] Failed for file ${fileId}:`, error);

      let errorMessage = 'Download failed';

      if (error.name === 'AbortError' || error.message?.includes('abort')) {
        errorMessage = 'Download timeout';
      } else if (error.message === 'File not found') {
        errorMessage = 'File not found';
        queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
      } else if (error.message) {
        errorMessage = error.message;
      }

      setDownloadFailed(fileId, errorMessage);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    queueFiles(Array.from(selectedFiles));

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    if (isProcessing) return;

    const { items, files: legacyFiles } = e.dataTransfer;

    if (!items || items.length === 0) {
      const droppedFiles = Array.from(legacyFiles || []).filter(f => f.size > 0);
      if (droppedFiles.length > 0) {
        queueFiles(droppedFiles);
      } else {
        alert('Folder upload not supported in this browser. Please zip the folder manually or use a modern browser.');
      }
      return;
    }

    if (!isFolderSupported()) {
      const droppedFiles = Array.from(legacyFiles || []).filter(f => f.size > 0);
      if (droppedFiles.length > 0) {
        queueFiles(droppedFiles);
      } else {
        alert('Folder upload not supported in this browser. Please zip the folder manually or use a modern browser.');
      }
      return;
    }

    setIsProcessing(true);

    try {
      const { files, folders } = await processDataTransferItems(items);

      if (files.length > 0) {
        queueFiles(files);
      }

      if (folders.length === 0 && files.length === 0) {
        alert('No valid files found to upload.');
        setIsProcessing(false);
        return;
      }

      for (const folder of folders) {
        if (folder.items.length === 0) {
          continue;
        }

        const zippingId = addZipping(folder.name, folder.items.length);

        try {
          const zipFile = await zipFolder(folder.name, folder.items, (progress) => {
            updateProgress(zippingId, progress.filesProcessed, progress.currentFile);
          });

          setCompleted(zippingId);

          queueFiles([zipFile]);
        } catch (error) {
          console.error(`[Drop] Failed to zip folder ${folder.name}:`, error);
          const errorMessage =
            error instanceof FolderZipError
              ? error.message
              : 'Failed to create zip file';
          setFailed(zippingId, errorMessage);
        }
      }
    } catch (error) {
      console.error('[Drop] Failed to process dropped items:', error);
      alert('Failed to process dropped files/folders. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="card flex-1 flex flex-col relative"
      onDragEnter={canUpload ? handleDragEnter : undefined}
      onDragOver={canUpload ? handleDragOver : undefined}
      onDragLeave={canUpload ? handleDragLeave : undefined}
      onDrop={canUpload ? handleDrop : undefined}
    >
        {isDragging && canUpload && (
          <div className="absolute inset-0 z-10 bg-blue-500 bg-opacity-10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <Paperclip size={48} className="mx-auto mb-2 text-blue-400" />
              <p className="text-lg font-semibold text-blue-400">Drop files to upload</p>
            </div>
          </div>
        )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-100">Documents</h3>

        {canUpload && (
          <>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-primary btn-sm flex items-center space-x-2"
              title={`Upload files (max ${limits.maxFileSizeFormatted} per file)`}
            >
              <Paperclip size={14} />
              <span>Add Files</span>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        <ZippingNotification />
        <InlineUploadProgress />

        {files.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">
            {canUpload
              ? "No files yet. Click \"Add Files\" or drag & drop to upload."
              : "No files attached to this work."}
          </p>
        )}

        {files.map((file: FileStorageRecord) => {
          // Evaluate permissions for each file - this will re-evaluate when canDeleteResource changes
          const canDeleteThisFile = canDeleteResource ? canDeleteResource(file.user_id) : false;

          // Get download state for this file
          const downloadState = downloads.get(file.id);

          return (
            <FileListItem
              key={file.id}
              file={file}
              currentUserId={userId}
              onDownload={handleDownload}
              onConfirmDelete={canDeleteThisFile ? handleConfirmDelete : undefined}
              downloadState={downloadState}
            />
          );
        })}
      </div>

      {/* Non-blocking confirmation dialog */}
      {ConfirmDialog}
    </div>
  );
}
