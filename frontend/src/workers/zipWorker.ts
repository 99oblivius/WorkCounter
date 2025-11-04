import { zip } from 'fflate';

export interface ZipWorkerInput {
  files: Array<{
    path: string;
    data: Uint8Array;
  }>;
  level: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export interface ZipWorkerProgress {
  type: 'progress';
  current: number;
  total: number;
}

export interface ZipWorkerSuccess {
  type: 'success';
  data: Uint8Array;
}

export interface ZipWorkerError {
  type: 'error';
  error: string;
}

export type ZipWorkerMessage = ZipWorkerProgress | ZipWorkerSuccess | ZipWorkerError;

// Web Worker code
self.onmessage = async (e: MessageEvent<ZipWorkerInput>) => {
  const { files, level } = e.data;

  try {
    // Build the zip data structure
    const zipData: Record<string, Uint8Array> = {};

    for (let i = 0; i < files.length; i++) {
      zipData[files[i].path] = files[i].data;

      // Send progress updates
      self.postMessage({
        type: 'progress',
        current: i + 1,
        total: files.length,
      } as ZipWorkerProgress);
    }

    // Perform compression
    zip(zipData, { level }, (err, data) => {
      if (err) {
        self.postMessage({
          type: 'error',
          error: err.message || 'Compression failed',
        } as ZipWorkerError);
      } else {
        // Transfer the buffer back to main thread (zero-copy)
        const message: ZipWorkerSuccess = {
          type: 'success',
          data: data,
        };

        // Use structured clone with transfer list
        const transferList: Transferable[] = data.buffer instanceof ArrayBuffer
          ? [data.buffer]
          : [];

        self.postMessage(message, { transfer: transferList });
      }
    });
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
    } as ZipWorkerError);
  }
};
