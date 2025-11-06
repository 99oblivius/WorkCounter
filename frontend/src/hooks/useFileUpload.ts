import { useCallback, useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import { useUploadQueue } from '../stores/uploadQueueStore';
import { useQueryClient } from '@tanstack/react-query';
import { filesApi } from '../services/api';
import { sanitizeFilename, getFileExtension } from '../utils/format';
import { FILE_SIZE_LIMITS, FILE_MESSAGES } from '../config/fileConfig';

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
        // SECURITY: Add CSRF protection header required by backend
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
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

        onProgress: (bytesUploaded) => {
          const speed = calculateSpeed(uploadId, bytesUploaded);
          updateProgress(uploadId, bytesUploaded, speed);
        },

        onSuccess: () => {
          setCompleted(uploadId);
          speedTrackerRef.current.delete(uploadId);
          processQueue();
          queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
        },

        onAfterResponse: (_req, res) => {
          // Extract fileId IMMEDIATELY to prevent race conditions during cancellation
          const uploadMetadata = res.getHeader('Upload-Metadata');

          if (uploadMetadata) {
            try {
              // Format: "key1 value1,key2 value2"
              const pairs = uploadMetadata.split(',');

              for (const pair of pairs) {
                const [key, value] = pair.trim().split(' ');

                if (key === 'fileId' && value) {
                  const fileId = parseInt(atob(value), 10);
                  setFileId(uploadId, fileId);
                  break;
                }
              }
            } catch (e) {
              console.error('[Upload] Failed to parse fileId from metadata:', e);
              console.error('[Upload] Raw metadata was:', uploadMetadata);
            }
          }
        },
      });

      // Store tus instance IMMEDIATELY to prevent cancellation race conditions
      setTusUpload(uploadId, upload, upload.url || undefined);

      startUpload(uploadId);

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
          alert(FILE_MESSAGES.FILE_EMPTY(file.name));
          continue;
        }

        if (file.size > FILE_SIZE_LIMITS.MAX_FILE_SIZE) {
          alert(FILE_MESSAGES.FILE_EXCEEDS_LIMIT(file.name));
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
