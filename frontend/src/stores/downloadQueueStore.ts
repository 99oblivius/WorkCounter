import { create } from 'zustand';

export interface DownloadItem {
  id: number; // file ID
  fileName: string;
  fileSize: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  downloadedBytes: number;
  downloadSpeed: number; // bytes per second
  error?: string;
  startTime?: number;
  controller?: AbortController; // For cancellation
}

interface DownloadQueueStore {
  downloads: Map<number, DownloadItem>;

  // Actions
  addDownload: (fileId: number, fileName: string, fileSize: number, controller: AbortController) => void;
  updateProgress: (fileId: number, downloadedBytes: number, downloadSpeed: number) => void;
  setCompleted: (fileId: number) => void;
  setFailed: (fileId: number, error: string) => void;
  setCancelled: (fileId: number) => void;
  removeDownload: (fileId: number) => void;
  cancelDownload: (fileId: number) => void;
}

export const useDownloadQueue = create<DownloadQueueStore>((set, get) => ({
  downloads: new Map(),

  addDownload: (fileId, fileName, fileSize, controller) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      newDownloads.set(fileId, {
        id: fileId,
        fileName,
        fileSize,
        status: 'downloading',
        progress: 0,
        downloadedBytes: 0,
        downloadSpeed: 0,
        startTime: Date.now(),
        controller,
      });
      return { downloads: newDownloads };
    });
  },

  updateProgress: (fileId, downloadedBytes, downloadSpeed) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(fileId);
      if (download) {
        const progress = Math.min(100, Math.round((downloadedBytes / download.fileSize) * 100));
        newDownloads.set(fileId, {
          ...download,
          progress,
          downloadedBytes,
          downloadSpeed,
        });
      }
      return { downloads: newDownloads };
    });
  },

  setCompleted: (fileId) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(fileId);
      if (download) {
        newDownloads.set(fileId, {
          ...download,
          status: 'completed',
          progress: 100,
          downloadedBytes: download.fileSize,
          controller: undefined,
        });
      }
      return { downloads: newDownloads };
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      get().removeDownload(fileId);
    }, 3000);
  },

  setFailed: (fileId, error) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(fileId);
      if (download) {
        newDownloads.set(fileId, {
          ...download,
          status: 'failed',
          error,
          controller: undefined,
        });
      }
      return { downloads: newDownloads };
    });

    // Auto-remove after 5 seconds
    setTimeout(() => {
      get().removeDownload(fileId);
    }, 5000);
  },

  setCancelled: (fileId) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      const download = newDownloads.get(fileId);
      if (download) {
        newDownloads.set(fileId, {
          ...download,
          status: 'cancelled',
          controller: undefined,
        });
      }
      return { downloads: newDownloads };
    });

    // Auto-remove after 3 seconds
    setTimeout(() => {
      get().removeDownload(fileId);
    }, 3000);
  },

  removeDownload: (fileId) => {
    set((state) => {
      const newDownloads = new Map(state.downloads);
      newDownloads.delete(fileId);
      return { downloads: newDownloads };
    });
  },

  cancelDownload: (fileId) => {
    const download = get().downloads.get(fileId);
    if (download?.controller) {
      download.controller.abort();
      get().setCancelled(fileId);
    }
  },
}));
