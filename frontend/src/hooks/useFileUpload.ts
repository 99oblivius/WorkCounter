import { useCallback, useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import { useUploadQueue } from '../stores/uploadQueueStore';
import { useQueryClient } from '@tanstack/react-query';
import { filesApi } from '../services/api';
import { sanitizeFilename, getFileExtension } from '../utils/format';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

export function useFileUpload(workId: number, userId: number) {
  const queryClient = useQueryClient();
  const {
    addUpload,
    setTusUpload,
    setFileId,
    startUpload,
    updateProgress,
    setCompleted,
    setFailed,
    cancelUpload,
    getPendingUploads,
    getUploadingCount,
  } = useUploadQueue();

  const processingRef = useRef(false);
  const queueCheckInterval = useRef<number | null>(null);

  const speedTrackerRef = useRef<Map<string, {
    lastBytes: number;
    lastTime: number;
    smoothedSpeed: number;
    samples: Array<{ bytes: number; time: number }>;
  }>>(new Map());

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const uploadingCount = getUploadingCount();
      const maxConcurrent = 3;
      const availableSlots = maxConcurrent - uploadingCount;

      if (availableSlots > 0) {
        const pending = getPendingUploads();
        const toStart = pending.slice(0, availableSlots);

        toStart.forEach((upload) => {
          startTusUpload(upload.id, upload.file, upload.workId);
        });
      }
    } finally {
      processingRef.current = false;
    }
  }, [getUploadingCount, getPendingUploads]);

  useEffect(() => {
    queueCheckInterval.current = setInterval(processQueue, 500);
    return () => {
      if (queueCheckInterval.current) {
        clearInterval(queueCheckInterval.current);
      }
    };
  }, [processQueue]);

  const calculateSpeed = useCallback((uploadId: string, uploadedBytes: number): number => {
    const now = Date.now();
    const tracker = speedTrackerRef.current.get(uploadId);

    if (!tracker) {
      speedTrackerRef.current.set(uploadId, {
        lastBytes: uploadedBytes,
        lastTime: now,
        smoothedSpeed: 0,
        samples: [{ bytes: uploadedBytes, time: now }],
      });
      return 0;
    }

    const elapsed = (now - tracker.lastTime) / 1000;

    // Skip updates < 100ms to avoid spikes
    if (elapsed < 0.1) {
      return tracker.smoothedSpeed;
    }

    const bytesDiff = uploadedBytes - tracker.lastBytes;
    const instantSpeed = bytesDiff / elapsed;

    if (isNaN(instantSpeed) || !isFinite(instantSpeed) || instantSpeed < 0) {
      return tracker.smoothedSpeed;
    }

    tracker.samples.push({ bytes: uploadedBytes, time: now });

    // Keep samples from last 2 seconds for smoothing
    const twoSecondsAgo = now - 2000;
    tracker.samples = tracker.samples.filter(s => s.time > twoSecondsAgo);

    let averageSpeed = instantSpeed;
    if (tracker.samples.length >= 2) {
      const oldest = tracker.samples[0];
      const newest = tracker.samples[tracker.samples.length - 1];
      const totalTime = (newest.time - oldest.time) / 1000;
      const totalBytes = newest.bytes - oldest.bytes;

      if (totalTime > 0) {
        averageSpeed = totalBytes / totalTime;
      }
    }

    // EMA with alpha=0.3 balances responsiveness and smoothness
    const alpha = 0.3;
    const smoothedSpeed = tracker.smoothedSpeed === 0
      ? averageSpeed
      : (alpha * averageSpeed) + ((1 - alpha) * tracker.smoothedSpeed);

    tracker.lastBytes = uploadedBytes;
    tracker.lastTime = now;
    tracker.smoothedSpeed = smoothedSpeed;

    return Math.max(0, smoothedSpeed);
  }, []);

  const startTusUpload = useCallback(
    (uploadId: string, file: File, workId: number) => {
      const filename = sanitizeFilename(file.name);
      const extension = getFileExtension(file.name);

      const upload = new tus.Upload(file, {
        endpoint: `${API_URL}/api/files/upload`,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        chunkSize: 5 * 1024 * 1024,
        metadata: {
          filename,
          originalName: file.name,
          displayName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileExtension: extension,
          workId: workId.toString(),
          userId: userId.toString(),
        },
        // @ts-ignore - withCredentials exists but may not be in type definitions
        withCredentials: true,

        onError: (error) => {
          console.error(`[Upload] Failed for ${uploadId}:`, error);
          setFailed(uploadId, error.message || 'Upload failed');
          speedTrackerRef.current.delete(uploadId);
          processQueue();
          queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
        },

        onProgress: (bytesUploaded, bytesTotal) => {
          const speed = calculateSpeed(uploadId, bytesUploaded);
          updateProgress(uploadId, bytesUploaded, speed);

          // Log at 25% increments only
          const progress = Math.round((bytesUploaded / bytesTotal) * 100);
          if (progress % 25 === 0) {
            console.log(`[Upload] Progress for ${uploadId}: ${progress}% (${bytesUploaded}/${bytesTotal})`);
          }
        },

        onSuccess: () => {
          console.log(`[Upload] Completed: ${file.name}`);
          setCompleted(uploadId);
          speedTrackerRef.current.delete(uploadId);
          processQueue();
          queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
        },

        onAfterResponse: (_req, res) => {
          // Extract fileId IMMEDIATELY to prevent race conditions during cancellation
          const uploadMetadata = res.getHeader('Upload-Metadata');
          console.log(`[Upload] onAfterResponse - Upload-Metadata header:`, uploadMetadata);

          if (uploadMetadata) {
            try {
              // Format: "key1 value1,key2 value2"
              const pairs = uploadMetadata.split(',');
              console.log(`[Upload] Parsed ${pairs.length} metadata pairs:`, pairs);

              for (const pair of pairs) {
                const [key, value] = pair.trim().split(' ');
                console.log(`[Upload] Metadata pair - key: "${key}", value: "${value}"`);

                if (key === 'fileId' && value) {
                  const fileId = parseInt(atob(value), 10);
                  setFileId(uploadId, fileId);
                  console.log(`[Upload] ✓ Set fileId ${fileId} for upload ${uploadId}`);
                  break;
                }
              }
            } catch (e) {
              console.error('[Upload] Failed to parse fileId from metadata:', e);
              console.error('[Upload] Raw metadata was:', uploadMetadata);
            }
          } else {
            console.log(`[Upload] No Upload-Metadata header in response`);
          }
        },
      });

      // Store tus instance IMMEDIATELY to prevent cancellation race conditions
      setTusUpload(uploadId, upload, upload.url || undefined);

      startUpload(uploadId);

      console.log(`[Upload] Starting upload for: ${file.name}`);
      console.log(`[Upload] - uploadId: ${uploadId}`);
      console.log(`[Upload] - file size: ${file.size} bytes`);

      upload.start();
    },
    [
      userId,
      setTusUpload,
      setFileId,
      startUpload,
      calculateSpeed,
      updateProgress,
      setCompleted,
      setFailed,
      processQueue,
      queryClient,
    ]
  );

  const queueFiles = useCallback(
    (files: File[]) => {
      const uploadIds: string[] = [];

      for (const file of files) {
        if (file.size === 0) {
          console.warn(`[Upload] Skipping 0-byte file: ${file.name}`);
          alert(`File "${file.name}" is empty (0 bytes). Folders cannot be uploaded directly - please use a zip file.`);
          continue;
        }

        if (file.size > 5 * 1024 * 1024 * 1024) {
          alert(`File "${file.name}" exceeds 5GB limit`);
          continue;
        }

        const uploadId = addUpload(file, workId);
        uploadIds.push(uploadId);
      }

      setTimeout(() => processQueue(), 100);

      return uploadIds;
    },
    [workId, addUpload, processQueue]
  );

  const cancelUploadWithCleanup = useCallback(
    async (uploadId: string, fileId?: number) => {
      cancelUpload(uploadId);

      if (fileId) {
        try {
          await filesApi.cancel(fileId);
          console.log(`[Upload] Cancelled on backend: ${fileId}`);
        } catch (error) {
          console.error('[Upload] Failed to cancel on backend:', error);
        }
      }

      processQueue();
      queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
    },
    [cancelUpload, processQueue, queryClient, workId]
  );

  return {
    queueFiles,
    cancelUpload: cancelUploadWithCleanup,
  };
}
