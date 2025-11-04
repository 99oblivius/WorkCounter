import { Server, EVENTS } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import type { Upload } from '@tus/utils';
import type { ServerRequest } from 'srvx';
import { env } from '../config/env.js';
import { FileStorageModel } from '../models/FileStorage.js';
import crypto from 'crypto';

/**
 * tus resumable upload server integrated with MinIO S3
 */
export const tusServer = new Server({
  path: '/api/files/upload',

  // S3-compatible storage (MinIO)
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
    partSize: 5 * 1024 * 1024, // 5MB chunks for optimal performance
    expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000, // 7 days
  }),

  // Generate S3 key with folder structure: userId/files/workId/timestamp-uuid-filename
  namingFunction: async (req: ServerRequest, metadata?: Record<string, string | null>) => {
    if (!metadata) return crypto.randomBytes(16).toString('hex');

    const { userId, workId, filename } = metadata;
    const timestamp = Date.now();
    const uuid = crypto.randomBytes(8).toString('hex');
    // Return full S3 path with folders
    return `${userId}/files/${workId}/${timestamp}-${uuid}-${filename}`;
  },

  // Encode the S3 key for URL (contains slashes)
  generateUrl: (req: ServerRequest, { proto, host, path, id }) => {
    // Base64url encode the ID to make it URL-safe
    const encodedId = Buffer.from(id, 'utf-8').toString('base64url');
    return `${proto}://${host}${path}/${encodedId}`;
  },

  // Decode the S3 key from URL
  getFileIdFromRequest: (req: ServerRequest) => {
    // Extract last path segment and decode from base64url
    const pathParts = req.url?.split('/').filter(Boolean) || [];
    const encodedId = pathParts[pathParts.length - 1];
    if (!encodedId) return '';
    return Buffer.from(encodedId, 'base64url').toString('utf-8');
  },

  // When upload is initiated (POST)
  async onUploadCreate(req: ServerRequest, upload: Upload) {
    try {
      // Note: Authentication is already checked in the route handler
      const metadata = upload.metadata!;
      const userId = parseInt(metadata.userId as string, 10);
      const workId = parseInt(metadata.workId as string, 10);

      console.log(`[tus] Creating upload: ${metadata.displayName} (${upload.size} bytes)`);

      // Check if this upload already exists (prevents duplicates on retry)
      const existingFile = await FileStorageModel.findByTusId(upload.id);
      if (existingFile) {
        console.log(`[tus] Upload already exists with ID: ${existingFile.id}`);
        return {
          metadata: {
            fileId: Buffer.from(existingFile.id.toString()).toString('base64'),
          },
        };
      }

      // Storage key is the upload.id (already has folder structure from namingFunction)
      // Format: userId/files/workId/timestamp-uuid-filename
      const storageKey = upload.id;

      // Create database record
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

      // CRITICAL: Return metadata with base64-encoded fileId
      // This allows client to immediately get the fileId from Upload-Metadata header
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

  // When upload completes
  async onUploadFinish(req: ServerRequest, upload: Upload) {
    try {
      // Decode base64 fileId back to integer
      const fileIdBase64 = upload.metadata!.fileId as string;
      const fileId = parseInt(Buffer.from(fileIdBase64, 'base64').toString('utf-8'), 10);

      await FileStorageModel.complete(fileId);

      console.log(`[tus] Upload completed: ${fileId} - ${upload.metadata!.displayName}`);

      // No return needed for onUploadFinish
      return { body: '' };
    } catch (error) {
      console.error('[tus] Error in onUploadFinish:', error);
      throw error;
    }
  },

  // Max file size: 5GB
  maxSize: 5 * 1024 * 1024 * 1024,

  // Respect X-Forwarded-Host for CORS
  respectForwardedHeaders: true,

  // Disable termination endpoint (DELETE) for security
  // Users can cancel via frontend, cleanup happens via cron
  disableTerminationForFinishedUploads: true,

  // Track progress every 500ms
  postReceiveInterval: 500,
});

// Listen for upload progress events (optional - for server-side logging)
// Note: Client-side progress tracking is now handled in the upload queue store
tusServer.on(EVENTS.POST_RECEIVE, async (req: any, res: any, upload: Upload) => {
  try {
    // Safety checks
    if (!upload || !upload.id || !upload.size || !upload.offset) {
      return;
    }

    // Calculate progress
    const progress = Math.round((upload.offset / upload.size) * 100);

    // Log progress at 25% increments (for server-side monitoring only)
    if (progress % 25 === 0) {
      console.log(`[tus] Upload progress: ${progress}% (${upload.offset}/${upload.size} bytes)`);
    }

    // Optional: Update database progress (disabled for performance)
    // Client-side tracking is faster and more accurate
    // Uncomment if you need server-side progress in database:
    /*
    const file = await FileStorageModel.findByTusId(upload.id);
    if (file) {
      await FileStorageModel.updateProgress(file.id, upload.offset, progress);
    }
    */
  } catch (error) {
    // Silent failure - progress tracking is not critical
    console.error('[tus] Error in progress handler:', error);
  }
});

/**
 * Sanitize filename for storage
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_') // Replace spaces
    .replace(/_{2,}/g, '_') // Remove multiple underscores
    .substring(0, 200); // Limit length
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Generate unique ID for file tracking
 */
export function generateFileId(): string {
  return crypto.randomBytes(8).toString('hex');
}
