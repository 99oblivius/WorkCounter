import { sanitizeFilename } from './format';
import type { ZipWorkerInput, ZipWorkerMessage } from '../workers/zipWorker';

export interface FolderItem {
  path: string;
  file: File;
}

interface ZipProgress {
  filesProcessed: number;
  totalFiles: number;
  currentFile: string;
}

export class FolderZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FolderZipError';
  }
}

async function readFileAsUint8Array(file: File): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      resolve(new Uint8Array(arrayBuffer));
    };
    reader.onerror = () => reject(new Error(`Failed to read file: ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

export async function traverseFileTree(
  entry: FileSystemEntry,
  basePath = ''
): Promise<FolderItem[]> {
  const items: FolderItem[] = [];

  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => {
      fileEntry.file(resolve, reject);
    });

    const relativePath = basePath ? `${basePath}/${file.name}` : file.name;
    items.push({ path: relativePath, file });
  } else if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();

    const entries = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      const allEntries: FileSystemEntry[] = [];

      const readBatch = () => {
        reader.readEntries(
          (entries) => {
            if (entries.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...entries);
              readBatch();
            }
          },
          reject
        );
      };

      readBatch();
    });

    const newBasePath = basePath ? `${basePath}/${entry.name}` : entry.name;

    for (const childEntry of entries) {
      const childItems = await traverseFileTree(childEntry, newBasePath);
      items.push(...childItems);
    }
  }

  return items;
}

export async function zipFolder(
  folderName: string,
  files: FolderItem[],
  onProgress?: (progress: ZipProgress) => void
): Promise<File> {
  if (files.length === 0) {
    throw new FolderZipError('Cannot zip empty folder');
  }

  const totalFiles = files.length;

  // Step 1: Read all files into memory
  const fileDataArray: Array<{ path: string; data: Uint8Array }> = [];

  for (let i = 0; i < files.length; i++) {
    const { path, file } = files[i];

    try {
      if (onProgress) {
        onProgress({
          filesProcessed: i,
          totalFiles,
          currentFile: file.name,
        });
      }

      const data = await readFileAsUint8Array(file);
      fileDataArray.push({ path, data });
    } catch (error) {
      console.error(`Failed to process file ${file.name}:`, error);
      throw new FolderZipError(`Failed to process file: ${file.name}`);
    }
  }

  if (onProgress) {
    onProgress({
      filesProcessed: totalFiles,
      totalFiles,
      currentFile: 'Compressing...',
    });
  }

  // Step 2: Use Web Worker to compress files off the main thread
  const zipped = await new Promise<Uint8Array>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/zipWorker.ts', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = (e: MessageEvent<ZipWorkerMessage>) => {
      const message = e.data;

      if (message.type === 'progress') {
        // Worker is building zip structure, we can ignore this
        // since we already showed reading progress
      } else if (message.type === 'success') {
        worker.terminate();
        resolve(message.data);
      } else if (message.type === 'error') {
        worker.terminate();
        reject(new Error(message.error));
      }
    };

    worker.onerror = (error) => {
      worker.terminate();
      reject(new Error(`Worker error: ${error.message}`));
    };

    // Prepare data to transfer to worker
    const workerInput: ZipWorkerInput = {
      files: fileDataArray,
      level: 6,
    };

    // Collect all ArrayBuffers to transfer (zero-copy operation)
    const transferables: Transferable[] = fileDataArray
      .map(f => f.data.buffer)
      .filter((buf): buf is ArrayBuffer => buf instanceof ArrayBuffer);

    // Transfer ownership of buffers to worker (no memory copy!)
    worker.postMessage(workerInput, transferables);
  });

  const sanitizedName = sanitizeFilename(folderName);
  const zipFileName = `${sanitizedName}.zip`;

  // Convert to File object - create a proper ArrayBuffer from Uint8Array
  const buffer = new ArrayBuffer(zipped.byteLength);
  const view = new Uint8Array(buffer);
  view.set(zipped);

  const zipBlob = new Blob([buffer], { type: 'application/zip' });
  const zipFile = new File([zipBlob], zipFileName, {
    type: 'application/zip',
    lastModified: Date.now(),
  });

  return zipFile;
}

export function isFolderSupported(): boolean {
  if (typeof window === 'undefined') return false;

  const hasDataTransferItems = 'DataTransferItem' in window;
  const hasWebkitGetAsEntry =
    hasDataTransferItems &&
    'webkitGetAsEntry' in DataTransferItem.prototype;

  return hasDataTransferItems && hasWebkitGetAsEntry;
}

export interface ProcessedDropResult {
  files: File[];
  folders: Array<{
    name: string;
    items: FolderItem[];
  }>;
}

export async function processDataTransferItems(
  items: DataTransferItemList
): Promise<ProcessedDropResult> {
  const files: File[] = [];
  const folders: Array<{ name: string; items: FolderItem[] }> = [];

  console.log('[Folder Zip] Processing', items.length, 'items');

  const processedEntries: FileSystemEntry[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    console.log(`[Folder Zip] Item ${i}: kind=${item.kind}, type=${item.type}`);

    if (item.kind !== 'file') {
      console.log(`[Folder Zip] Skipping non-file item ${i}`);
      continue;
    }

    const entry = item.webkitGetAsEntry?.();
    if (!entry) {
      console.log(`[Folder Zip] No entry for item ${i}, using getAsFile fallback`);
      const file = item.getAsFile();
      if (file) {
        console.log(`[Folder Zip] File from getAsFile: ${file.name}, size=${file.size}`);
        if (file.size > 0) {
          files.push(file);
        } else {
          console.warn(`[Folder Zip] Skipping 0-byte file: ${file.name}`);
        }
      }
      continue;
    }

    console.log(`[Folder Zip] Entry ${i}: name=${entry.name}, isFile=${entry.isFile}, isDirectory=${entry.isDirectory}`);
    processedEntries.push(entry);
  }

  for (const entry of processedEntries) {
    if (entry.isFile) {
      console.log(`[Folder Zip] Processing file: ${entry.name}`);
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });

      console.log(`[Folder Zip] File details: ${file.name}, size=${file.size}`);
      if (file.size > 0) {
        files.push(file);
      } else {
        console.warn(`[Folder Zip] Skipping 0-byte file: ${file.name}`);
      }
    } else if (entry.isDirectory) {
      console.log(`[Folder Zip] Processing directory: ${entry.name}`);
      try {
        const folderItems = await traverseFileTree(entry);
        console.log(`[Folder Zip] Folder "${entry.name}" contains ${folderItems.length} items`);

        if (folderItems.length === 0) {
          console.warn(`[Folder Zip] Skipping empty folder: ${entry.name}`);
          continue;
        }

        folders.push({
          name: entry.name,
          items: folderItems,
        });
      } catch (error) {
        console.error(`[Folder Zip] Failed to process folder ${entry.name}:`, error);
        throw new FolderZipError(`Failed to process folder: ${entry.name}`);
      }
    } else {
      console.warn(`[Folder Zip] Unknown entry type for: ${entry.name}`);
    }
  }

  console.log(`[Folder Zip] Result: ${files.length} files, ${folders.length} folders`);
  return { files, folders };
}

export function estimateFolderSize(items: FolderItem[]): number {
  return items.reduce((total, { file }) => total + file.size, 0);
}

export function formatFolderStats(items: FolderItem[]): string {
  const fileCount = items.length;
  const totalSize = estimateFolderSize(items);
  const sizeMB = (totalSize / (1024 * 1024)).toFixed(1);

  return `${fileCount} file${fileCount !== 1 ? 's' : ''} (${sizeMB} MB)`;
}
