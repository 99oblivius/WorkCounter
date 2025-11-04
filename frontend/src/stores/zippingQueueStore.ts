import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ZippingItem {
  id: string;
  folderName: string;
  totalFiles: number;
  filesProcessed: number;
  currentFile: string;
  status: 'scanning' | 'zipping' | 'completed' | 'failed' | 'cancelled';
  error?: string;
  startedAt: number;
  completedAt?: number;
}

interface ZippingQueueState {
  zippings: Map<string, ZippingItem>;

  addZipping: (folderName: string, totalFiles: number) => string;
  updateProgress: (id: string, filesProcessed: number, currentFile: string) => void;
  setCompleted: (id: string) => void;
  setFailed: (id: string, error: string) => void;
  setCancelled: (id: string) => void;
  removeZipping: (id: string) => void;
  clearCompleted: () => void;

  getActiveZippings: () => ZippingItem[];
  isZipping: () => boolean;
}

function generateZippingId(): string {
  return `zip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export const useZippingQueue = create<ZippingQueueState>()(
  devtools(
    (set, get) => ({
      zippings: new Map(),

      addZipping: (folderName: string, totalFiles: number) => {
        const id = generateZippingId();

        set((state) => {
          const newZippings = new Map(state.zippings);
          newZippings.set(id, {
            id,
            folderName,
            totalFiles,
            filesProcessed: 0,
            currentFile: 'Scanning...',
            status: 'scanning',
            startedAt: Date.now(),
          });
          return { zippings: newZippings };
        });

        return id;
      },

      updateProgress: (id: string, filesProcessed: number, currentFile: string) => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          const zipping = newZippings.get(id);
          if (zipping) {
            zipping.filesProcessed = filesProcessed;
            zipping.currentFile = currentFile;
            zipping.status = 'zipping';
          }
          return { zippings: newZippings };
        });
      },

      setCompleted: (id: string) => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          const zipping = newZippings.get(id);
          if (zipping) {
            zipping.status = 'completed';
            zipping.completedAt = Date.now();
          }
          return { zippings: newZippings };
        });

        setTimeout(() => {
          get().removeZipping(id);
        }, 3000);
      },

      setFailed: (id: string, error: string) => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          const zipping = newZippings.get(id);
          if (zipping) {
            zipping.status = 'failed';
            zipping.error = error;
            zipping.completedAt = Date.now();
          }
          return { zippings: newZippings };
        });
      },

      setCancelled: (id: string) => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          const zipping = newZippings.get(id);
          if (zipping) {
            zipping.status = 'cancelled';
            zipping.completedAt = Date.now();
          }
          return { zippings: newZippings };
        });

        setTimeout(() => {
          get().removeZipping(id);
        }, 2000);
      },

      removeZipping: (id: string) => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          newZippings.delete(id);
          return { zippings: newZippings };
        });
      },

      clearCompleted: () => {
        set((state) => {
          const newZippings = new Map(state.zippings);
          for (const [id, zipping] of newZippings) {
            if (zipping.status === 'completed') {
              newZippings.delete(id);
            }
          }
          return { zippings: newZippings };
        });
      },

      getActiveZippings: () => {
        const state = get();
        return Array.from(state.zippings.values()).filter(
          (z) => z.status === 'scanning' || z.status === 'zipping'
        );
      },

      isZipping: () => {
        const state = get();
        return Array.from(state.zippings.values()).some(
          (z) => z.status === 'scanning' || z.status === 'zipping'
        );
      },
    }),
    { name: 'ZippingQueue' }
  )
);
