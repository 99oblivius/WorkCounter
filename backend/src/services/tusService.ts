import { Server, EVENTS } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import type { Upload } from '@tus/utils';
import type { ServerRequest } from 'srvx';
import { env } from '../config/env.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { FILE_SIZE_LIMITS } from '../config/fileConfig.js';
import { sseService } from './sseService.js';
import { WorkAccessService } from './workAccessService.js';
import crypto from 'crypto';

export const tusServer = new Server({
  path: '/api/files/upload',

  datastore: new S3Store({
    s3ClientConfig: {
      bucket: env.MINIO_BUCKET,
      endpoint: `http://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: env.MINIO_ACCESS_KEY,
        secretAccessKey: env.MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    },
    partSize: 5 * 1024 * 1024,
    expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000,
  }),

  namingFunction: async (req: ServerRequest, metadata?: Record<string, string | null>) => {
    if (!metadata) return crypto.randomBytes(16).toString('hex');

    const { userId, workId, filename } = metadata;
    const timestamp = Date.now();
    const uuid = crypto.randomBytes(8).toString('hex');
    return `${userId}/files/${workId}/${timestamp}-${uuid}-${filename}`;
  },

  generateUrl: (req: ServerRequest, { proto, host, path, id }) => {
    const encodedId = Buffer.from(id, 'utf-8').toString('base64url');
    return `${proto}://${host}${path}/${encodedId}`;
  },

  getFileIdFromRequest: (req: ServerRequest) => {
    const pathParts = req.url?.split('/').filter(Boolean) || [];
    const encodedId = pathParts[pathParts.length - 1];
    if (!encodedId) return '';
    return Buffer.from(encodedId, 'base64url').toString('utf-8');
  },

  async onUploadCreate(req: ServerRequest, upload: Upload) {
    try {
      const metadata = upload.metadata!;
      const userId = parseInt(metadata.userId as string, 10);
      const workId = parseInt(metadata.workId as string, 10);

      console.log(`[tus] Creating upload: ${metadata.displayName} (${upload.size} bytes)`);

      // SECURITY: Check work-specific create permission (Editor+)
      const workAccess = await WorkAccessService.checkAccess(userId, workId);
      console.log(`[tus] Work access for user ${userId} on work ${workId}:`, JSON.stringify(workAccess));
      if (!workAccess.canCreate) {
        console.error(`[tus] User ${userId} lacks create permission for work ${workId}`);
        throw new Error('Editor or Manager permission required to upload files');
      }

      const existingFile = await FileStorageModel.findByTusId(upload.id);
      if (existingFile) {
        console.log(`[tus] Upload already exists with ID: ${existingFile.id}`);
        return {
          metadata: {
            fileId: Buffer.from(existingFile.id.toString()).toString('base64'),
          },
        };
      }

      const storageKey = upload.id;

      const file = await FileStorageModel.create({
        workId,
        userId,
        filename: metadata.filename as string,
        originalName: metadata.originalName as string,
        displayName: metadata.displayName as string,
        fileSize: upload.size || 0,
        mimeType: metadata.mimeType as string || null,
        fileExtension: metadata.fileExtension as string || null,
        tusId: upload.id,
        storageKey,
      });

      const fileIdBase64 = Buffer.from(file.id.toString()).toString('base64');
      console.log(`[tus] Created file record ID: ${file.id}, storage key: ${storageKey}`);
      console.log(`[tus] Returning fileId in metadata: ${file.id} (base64: ${fileIdBase64})`);

      // Return fileId in metadata for client to capture immediately
      return {
        metadata: {
          fileId: fileIdBase64,
        },
      };
    } catch (error) {
      console.error('[tus] Error in onUploadCreate:', error);
      throw error;
    }
  },

  async onUploadFinish(req: ServerRequest, upload: Upload) {
    try {
      const fileIdBase64 = upload.metadata!.fileId as string;
      const fileId = parseInt(Buffer.from(fileIdBase64, 'base64').toString('utf-8'), 10);

      await FileStorageModel.complete(fileId);

      console.log(`[tus] Upload completed: ${fileId} - ${upload.metadata!.displayName}`);

      // Emit SSE event for real-time updates
      const file = await FileStorageModel.findByIdWithoutUserFilter(fileId);
      if (file) {
        await sseService.emitWorkUpdate(file.work_id, 'file:upload', file);
        console.log(`[tus] SSE event emitted for file ${fileId} on work ${file.work_id}`);
      } else {
        console.error(`[tus] Could not find file ${fileId} to emit SSE event`);
      }

      return { body: '' };
    } catch (error) {
      console.error('[tus] Error in onUploadFinish:', error);
      throw error;
    }
  },

  maxSize: FILE_SIZE_LIMITS.MAX_FILE_SIZE,

  respectForwardedHeaders: true,

  // Disable DELETE endpoint - users cancel via frontend, cleanup via cron
  disableTerminationForFinishedUploads: true,

  postReceiveInterval: 500,
});

tusServer.on(EVENTS.POST_RECEIVE, async (req: any, res: any, upload: Upload) => {
  try {
    if (!upload || !upload.id || !upload.size || !upload.offset) {
      return;
    }

    const progress = Math.round((upload.offset / upload.size) * 100);

    // Log at 25% increments for server-side monitoring
    if (progress % 25 === 0) {
      console.log(`[tus] Upload progress: ${progress}% (${upload.offset}/${upload.size} bytes)`);
    }

    // Database progress updates disabled - client-side tracking is faster
    // Uncomment if needed:
    /*
    const file = await FileStorageModel.findByTusId(upload.id);
    if (file) {
      await FileStorageModel.updateProgress(file.id, upload.offset, progress);
    }
    */
  } catch (error) {
    console.error('[tus] Error in progress handler:', error);
  }
});

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .substring(0, 200);
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function generateFileId(): string {
  return crypto.randomBytes(8).toString('hex');
}
