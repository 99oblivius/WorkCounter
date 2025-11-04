import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import * as tus from 'tus-js-client';

export interface UploadItem {
  id: string; // Unique client-side ID
  fileId?: number; // Database ID (set after server response)
  file: File;
  workId: number;

  // Status
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;

  // Speed tracking
  speed: number; // Bytes per second
  eta: number; // Estimated seconds remaining

  // tus upload instance (not persisted)
  tusUpload?: tus.Upload;
  uploadUrl?: string; // For resuming

  // Timestamps
  startedAt?: number;
  completedAt?: number;

  // Error
  error?: string;
  retryCount: number;
}

interface UploadQueueState {
  // Queue
  uploads: Map<string, UploadItem>;
  maxConcurrent: number;

  // Actions
  addUpload: (file: File, workId: number) => string;
  removeUpload: (uploadId: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;

  // Upload control
  setTusUpload: (uploadId: string, tusUpload: tus.Upload, uploadUrl?: string) => void;
  setFileId: (uploadId: string, fileId: number) => void;
  startUpload: (uploadId: string) => void;
  pauseUpload: (uploadId: string) => void;
  resumeUpload: (uploadId: string) => void;
  cancelUpload: (uploadId: string) => void;
  retryUpload: (uploadId: string) => void;

  // Progress updates
  updateProgress: (uploadId: string, uploadedBytes: number, speed: number) => void;
  setCompleted: (uploadId: string) => void;
  setFailed: (uploadId: string, error: string) => void;

  // Computed
  getActiveUploads: () => UploadItem[];
  getPendingUploads: () => UploadItem[];
  getUploadingCount: () => number;
  isUploading: () => boolean;
  getTotalProgress: () => number;
}

// Helper to calculate ETA
function calculateETA(remainingBytes: number, speed: number): number {
  if (speed === 0) return 0;
  return Math.round(remainingBytes / speed);
}

// Generate unique upload ID
function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useUploadQueue = create<UploadQueueState>()(
  devtools(
    persist(
      (set, get) => ({
        uploads: new Map(),
        maxConcurrent: 3, // Max 3 simultaneous uploads (Dropbox-like)

        // Add file to queue
        addUpload: (file: File, workId: number) => {
          const id = generateUploadId();

          set((state) => {
            const newUploads = new Map(state.uploads);
            newUploads.set(id, {
              id,
              file,
              workId,
              status: 'pending',
              progress: 0,
              uploadedBytes: 0,
              totalBytes: file.size,
              speed: 0,
              eta: 0,
              retryCount: 0,
            });
            return { uploads: newUploads };
          });

          return id;
        },

        // Remove upload from queue
        removeUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);

            // Abort tus upload if active
            if (upload?.tusUpload) {
              try {
                upload.tusUpload.abort(true);
              } catch (e) {
                console.error('Error aborting upload:', e);
              }
            }

            newUploads.delete(uploadId);
            return { uploads: newUploads };
          });
        },

        // Clear completed uploads
        clearCompleted: () => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            for (const [id, upload] of newUploads) {
              if (upload.status === 'completed') {
                newUploads.delete(id);
              }
            }
            return { uploads: newUploads };
          });
        },

        // Clear all uploads
        clearAll: () => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            // Abort all active uploads
            for (const upload of newUploads.values()) {
              if (upload.tusUpload && upload.status === 'uploading') {
                try {
                  upload.tusUpload.abort(true);
                } catch (e) {
                  console.error('Error aborting upload:', e);
                }
              }
            }
            newUploads.clear();
            return { uploads: newUploads };
          });
        },

        // Set tus upload instance (called immediately after creation)
        setTusUpload: (uploadId: string, tusUpload: tus.Upload, uploadUrl?: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.tusUpload = tusUpload;
              upload.uploadUrl = uploadUrl;
            }
            return { uploads: newUploads };
          });
        },

        // Set file ID from server
        setFileId: (uploadId: string, fileId: number) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.fileId = fileId;
            }
            return { uploads: newUploads };
          });
        },

        // Start upload
        startUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.status = 'uploading';
              upload.startedAt = Date.now();
            }
            return { uploads: newUploads };
          });
        },

        // Pause upload
        pauseUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload?.tusUpload) {
              upload.tusUpload.abort(false); // Don't terminate, just pause
              upload.status = 'paused';
            }
            return { uploads: newUploads };
          });
        },

        // Resume upload
        resumeUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.status = 'pending';
              upload.error = undefined;
            }
            return { uploads: newUploads };
          });
        },

        // Cancel upload
        cancelUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload?.tusUpload) {
              upload.tusUpload.abort(true); // Terminate upload
              upload.status = 'cancelled';
            }
            return { uploads: newUploads };
          });
        },

        // Retry failed upload
        retryUpload: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.status = 'pending';
              upload.error = undefined;
              upload.retryCount += 1;
              upload.progress = 0;
              upload.uploadedBytes = 0;
              upload.speed = 0;
              upload.eta = 0;
            }
            return { uploads: newUploads };
          });
        },

        // Update progress
        updateProgress: (uploadId: string, uploadedBytes: number, speed: number) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.uploadedBytes = uploadedBytes;
              upload.progress = Math.round((uploadedBytes / upload.totalBytes) * 100);
              upload.speed = speed;
              upload.eta = calculateETA(upload.totalBytes - uploadedBytes, speed);
            }
            return { uploads: newUploads };
          });
        },

        // Mark as completed
        setCompleted: (uploadId: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.status = 'completed';
              upload.progress = 100;
              upload.completedAt = Date.now();
              upload.tusUpload = undefined; // Clear reference
            }
            return { uploads: newUploads };
          });
        },

        // Mark as failed
        setFailed: (uploadId: string, error: string) => {
          set((state) => {
            const newUploads = new Map(state.uploads);
            const upload = newUploads.get(uploadId);
            if (upload) {
              upload.status = 'failed';
              upload.error = error;
              upload.tusUpload = undefined; // Clear reference
            }
            return { uploads: newUploads };
          });
        },

        // Get active uploads
        getActiveUploads: () => {
          const state = get();
          return Array.from(state.uploads.values()).filter(
            u => u.status === 'uploading' || u.status === 'pending' || u.status === 'paused'
          );
        },

        // Get pending uploads
        getPendingUploads: () => {
          const state = get();
          return Array.from(state.uploads.values()).filter(u => u.status === 'pending');
        },

        // Get count of uploading files
        getUploadingCount: () => {
          const state = get();
          return Array.from(state.uploads.values()).filter(u => u.status === 'uploading').length;
        },

        // Check if any uploads are active
        isUploading: () => {
          const state = get();
          return Array.from(state.uploads.values()).some(
            u => u.status === 'uploading' || u.status === 'pending'
          );
        },

        // Calculate total progress
        getTotalProgress: () => {
          const state = get();
          const uploads = Array.from(state.uploads.values());
          if (uploads.length === 0) return 0;

          const totalBytes = uploads.reduce((sum, u) => sum + u.totalBytes, 0);
          const uploadedBytes = uploads.reduce((sum, u) => sum + u.uploadedBytes, 0);

          return Math.round((uploadedBytes / totalBytes) * 100);
        },
      }),
      {
        name: 'upload-queue',
        // Only persist metadata, not File objects or tus instances
        partialize: (state) => ({
          uploads: Array.from(state.uploads.entries())
            .filter(([, upload]) => upload.status !== 'completed' && upload.uploadUrl)
            .map(([id, upload]) => [
              id,
              {
                id: upload.id,
                fileId: upload.fileId,
                workId: upload.workId,
                status: upload.status,
                progress: upload.progress,
                uploadedBytes: upload.uploadedBytes,
                totalBytes: upload.totalBytes,
                uploadUrl: upload.uploadUrl,
                retryCount: upload.retryCount,
                // Note: File object cannot be persisted
              },
            ]),
        }),
      }
    ),
    { name: 'UploadQueue' }
  )
);
