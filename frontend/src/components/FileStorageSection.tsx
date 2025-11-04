import React, { useRef, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Paperclip } from 'lucide-react';
import FileListItem from './FileListItem';
import InlineUploadProgress from './InlineUploadProgress';
import ZippingNotification from './ZippingNotification';
import { filesApi } from '../services/api';
import { useFileUpload } from '../hooks/useFileUpload';
import { useZippingQueue } from '../stores/zippingQueueStore';
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
}

export default function FileStorageSection({ workId, userId }: FileStorageSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { queueFiles } = useFileUpload(workId, userId);
  const { addZipping, updateProgress, setCompleted, setFailed } = useZippingQueue();

  // No polling - uploads update via queue invalidation
  const { data: files = [] } = useQuery({
    queryKey: ['files', 'work', workId],
    queryFn: async () => {
      const response = await filesApi.getByWorkId(workId);
      return response.data;
    },
    refetchInterval: false,
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: number) => filesApi.delete(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
    },
  });

  const handleDownload = async (fileId: number) => {
    try {
      const response = await filesApi.download(fileId);
      const file = files.find(f => f.id === fileId);
      if (!file) return;

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.display_name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download file');
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

  // Drag counter prevents flickering when dragging over child elements
  const dragCounterRef = useRef(0);

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

    console.log('[Drop] DataTransfer items:', items?.length || 0);
    console.log('[Drop] DataTransfer files:', legacyFiles?.length || 0);
    console.log('[Drop] Folder support:', isFolderSupported());

    if (!items || items.length === 0) {
      console.log('[Drop] No items, falling back to legacy files API');
      const droppedFiles = Array.from(legacyFiles || []).filter(f => f.size > 0);
      if (droppedFiles.length > 0) {
        queueFiles(droppedFiles);
      } else {
        console.warn('[Drop] All files have 0 bytes - might be folders');
        alert('Folder upload not supported in this browser. Please zip the folder manually or use a modern browser.');
      }
      return;
    }

    if (!isFolderSupported()) {
      console.log('[Drop] Folder API not supported, falling back to legacy files');
      const droppedFiles = Array.from(legacyFiles || []).filter(f => f.size > 0);
      if (droppedFiles.length > 0) {
        queueFiles(droppedFiles);
      } else {
        console.warn('[Drop] All files have 0 bytes - might be folders');
        alert('Folder upload not supported in this browser. Please zip the folder manually or use a modern browser.');
      }
      return;
    }

    setIsProcessing(true);

    try {
      console.log('[Drop] Processing items with folder support...');
      const { files, folders } = await processDataTransferItems(items);

      console.log('[Drop] Detected files:', files.length);
      console.log('[Drop] Detected folders:', folders.length);

      if (files.length > 0) {
        console.log('[Drop] Queueing', files.length, 'files for upload');
        queueFiles(files);
      }

      if (folders.length === 0 && files.length === 0) {
        console.warn('[Drop] No valid files or folders detected');
        alert('No valid files found to upload.');
        setIsProcessing(false);
        return;
      }

      for (const folder of folders) {
        if (folder.items.length === 0) {
          console.warn(`[Drop] Skipping empty folder: ${folder.name}`);
          continue;
        }

        console.log(`[Drop] Zipping folder "${folder.name}" with ${folder.items.length} files`);
        const zippingId = addZipping(folder.name, folder.items.length);

        try {
          const zipFile = await zipFolder(folder.name, folder.items, (progress) => {
            updateProgress(zippingId, progress.filesProcessed, progress.currentFile);
          });

          console.log(`[Drop] Zip complete: ${zipFile.name} (${zipFile.size} bytes)`);
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
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 bg-blue-500 bg-opacity-10 border-2 border-dashed border-blue-500 rounded-lg flex items-center justify-center pointer-events-none">
          <div className="text-center">
            <Paperclip size={48} className="mx-auto mb-2 text-blue-400" />
            <p className="text-lg font-semibold text-blue-400">Drop files to upload</p>
          </div>
        </div>
      )}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-100">Attached Files</h3>

        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn btn-primary btn-sm flex items-center space-x-2"
          title="Upload files"
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
      </div>

      <div className="space-y-2 flex-1 overflow-y-auto">
        <ZippingNotification />
        <InlineUploadProgress />

        {files.length === 0 && (
          <p className="text-gray-500 text-center py-4 text-sm">
            No files yet. Click "Add Files" or drag & drop to upload.
          </p>
        )}

        {files.map((file: FileStorageRecord) => (
          <FileListItem
            key={file.id}
            file={file}
            onDownload={handleDownload}
            onDelete={deleteMutation.mutate}
          />
        ))}
      </div>
    </div>
  );
}
