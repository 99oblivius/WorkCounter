# WorkCounter Professional File Storage System - Implementation Plan

## Executive Summary

This document outlines the implementation of a **production-grade file storage system** for WorkCounter that supports:
- ✅ **5GB file size limit** with chunked streaming uploads
- ✅ **Duplicate filenames allowed** via upload bundle UIDs
- ✅ **Any file type** (no MIME filtering)
- ✅ **Multiple simultaneous uploads** with queue management
- ✅ **Resumable uploads** with progress bars
- ✅ **Safe cleanup and cancellation** on errors/exit
- ✅ **Professional-grade UX** matching top-tier platforms

---

## 1. Architecture Overview

### Technology Stack

**Backend:**
- **tus Node.js Server** (`@tus/server`, `@tus/s3-store`) - Resumable upload protocol
- **Express.js** - API routing
- **MinIO/S3** - Object storage
- **PostgreSQL** - Metadata storage

**Frontend:**
- **tus-js-client** - Resumable upload client
- **JSZip** - Folder compression (client-side)
- **file-icon-vectors** - SVG file type icons
- **React Query** - State management
- **Zustand** (new) - Upload queue state

**Why tus Protocol?**
- Industry standard for resumable uploads (used by Vimeo, Cloudflare)
- Built-in chunking (1MB default, configurable)
- Automatic retry and resume on network failures
- Server-side implementations for Node.js + S3
- Client libraries maintained and battle-tested

---

## 2. Upload Bundle UID System

### Concept
Each upload session gets a unique bundle ID, allowing duplicate filenames across different upload sessions.

### Storage Key Structure
```
${userId}/files/${workId}/${uploadBundleId}/${sanitizedFilename}
```

**Example:**
```
1/files/42/2024-11-03-a3f7d91e/project-requirements.pdf
1/files/42/2024-11-03-b8e2c45f/project-requirements.pdf  ← Same filename, different bundle
```

### Bundle ID Generation
```typescript
// Format: YYYY-MM-DD-{8-char-hex}
const generateBundleId = (): string => {
  const date = new Date().toISOString().split('T')[0];
  const random = crypto.randomBytes(4).toString('hex');
  return `${date}-${random}`;
};
```

### Bundle Lifecycle
1. **Created**: User initiates upload (one or more files)
2. **Uploading**: Files are being uploaded
3. **Completed**: All files successfully uploaded
4. **Failed**: One or more files failed (partial bundle)
5. **Abandoned**: User closed browser mid-upload

---

## 3. Chunked Upload Strategy (5GB Support)

### tus Protocol Configuration

**Chunk Size:** 5MB (optimal for most networks)
- Small enough for mobile networks
- Large enough to minimize HTTP overhead
- Configurable per-client based on connection speed

**Upload Flow:**
```
1. Client: POST /files/upload (create upload)
   Server: Returns upload URL + metadata location

2. Client: PATCH /files/upload/{id} (upload chunks)
   Headers: Upload-Offset, Content-Type: application/offset+octet-stream
   Server: Responds with new offset after each chunk

3. Repeat step 2 until complete

4. Server: Triggers completion webhook
   Client: Updates UI to show completed
```

### MinIO S3 Multipart Upload
tus S3 store will use S3's native multipart upload API:
- Automatically splits large files into parts (5MB each)
- Parts uploaded in parallel (configurable concurrency)
- S3 assembles parts into final object on completion
- Failed parts can be retried independently

### Backend Configuration
```typescript
// backend/src/services/tusService.ts
import { Server } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { S3Client } from '@aws-sdk/client-s3';

export const tusServer = new Server({
  path: '/api/files/upload',
  datastore: new S3Store({
    s3Client: minioClient,
    bucket: env.MINIO_BUCKET,
    partSize: 5 * 1024 * 1024, // 5MB chunks
    expirationPeriodInMilliseconds: 24 * 60 * 60 * 1000, // 24h cleanup
  }),

  // Hooks for metadata and validation
  onUploadCreate: async (req, res, upload) => {
    // Extract metadata from upload.metadata
    // Create database record
    // Generate bundle ID if not provided
    // Return augmented metadata
  },

  onUploadFinish: async (req, res, upload) => {
    // Update database record to 'completed'
    // Trigger any post-processing (virus scan, etc.)
  },

  // Max file size: 5GB
  maxSize: 5 * 1024 * 1024 * 1024,

  // Allow resumable uploads for 7 days
  expiration: 7 * 24 * 60 * 60 * 1000,

  // CORS for frontend access
  respectForwardedHeaders: true,
});
```

---

## 4. Database Schema

### Table: `upload_bundles`
Represents a single upload session (one or more files uploaded together).

```sql
CREATE TABLE upload_bundles (
  id SERIAL PRIMARY KEY,
  bundle_id VARCHAR(64) NOT NULL UNIQUE, -- e.g., "2024-11-03-a3f7d91e"
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Bundle metadata
  total_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  total_size BIGINT NOT NULL DEFAULT 0, -- Bytes
  uploaded_size BIGINT NOT NULL DEFAULT 0, -- Bytes

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'uploading',
    -- 'uploading', 'completed', 'failed', 'abandoned'

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT bundle_status_check
    CHECK (status IN ('uploading', 'completed', 'failed', 'abandoned'))
);

CREATE INDEX idx_upload_bundles_work_id ON upload_bundles(work_id);
CREATE INDEX idx_upload_bundles_user_id ON upload_bundles(user_id);
CREATE INDEX idx_upload_bundles_status ON upload_bundles(status);
CREATE INDEX idx_upload_bundles_created_at ON upload_bundles(created_at DESC);
```

### Table: `file_storage`
Represents individual files within upload bundles.

```sql
CREATE TABLE file_storage (
  id SERIAL PRIMARY KEY,
  bundle_id VARCHAR(64) NOT NULL REFERENCES upload_bundles(bundle_id) ON DELETE CASCADE,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File identity
  filename VARCHAR(255) NOT NULL,           -- Sanitized filename (URL-safe)
  original_name VARCHAR(255) NOT NULL,      -- User's original filename
  display_name VARCHAR(255) NOT NULL,       -- For UI display (preserves case, spaces)

  -- File metadata
  file_size BIGINT NOT NULL,                -- Bytes
  mime_type VARCHAR(100),                   -- Content type (can be null for unknown)
  file_extension VARCHAR(20),               -- e.g., "pdf", "psd", "blend"

  -- Storage
  storage_key VARCHAR(500) NOT NULL UNIQUE, -- Full MinIO path
  tus_id VARCHAR(255),                      -- tus upload ID (for resumability)

  -- Upload tracking
  upload_status VARCHAR(20) NOT NULL DEFAULT 'uploading',
    -- 'uploading', 'completed', 'failed', 'cancelled'
  upload_progress INTEGER DEFAULT 0,        -- Percentage (0-100)
  uploaded_bytes BIGINT DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  uploaded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT file_upload_status_check
    CHECK (upload_status IN ('uploading', 'completed', 'failed', 'cancelled')),
  CONSTRAINT file_size_check
    CHECK (file_size > 0 AND file_size <= 5368709120), -- 5GB
  CONSTRAINT upload_progress_check
    CHECK (upload_progress >= 0 AND upload_progress <= 100)
);

-- Indexes for performance
CREATE INDEX idx_file_storage_bundle_id ON file_storage(bundle_id);
CREATE INDEX idx_file_storage_work_id ON file_storage(work_id);
CREATE INDEX idx_file_storage_user_id ON file_storage(user_id);
CREATE INDEX idx_file_storage_status ON file_storage(upload_status);
CREATE INDEX idx_file_storage_uploaded_at ON file_storage(uploaded_at DESC);

-- Full-text search on filenames
CREATE INDEX idx_file_storage_display_name ON file_storage
  USING gin(to_tsvector('english', display_name));

-- Trigger for updated_at
CREATE TRIGGER update_file_storage_updated_at
  BEFORE UPDATE ON file_storage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_upload_bundles_updated_at
  BEFORE UPDATE ON upload_bundles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### Why Two Tables?

1. **Bundle-level operations**: Delete entire upload session, view bundle history
2. **File-level operations**: Download, delete individual files
3. **Progress tracking**: Bundle shows overall progress, files show individual progress
4. **Better queries**: "Show all files for this work" joins on work_id efficiently

---

## 5. Backend Implementation

### 5.1. Package Dependencies

```json
// backend/package.json additions
{
  "dependencies": {
    "@tus/server": "^1.5.0",
    "@tus/s3-store": "^1.5.0",
    "uuid": "^9.0.0"
  }
}
```

### 5.2. tus Integration

**File: `backend/src/services/tusService.ts`**

```typescript
import { Server, Upload } from '@tus/server';
import { S3Store } from '@tus/s3-store';
import { minioService } from './minioService.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { UploadBundleModel } from '../models/UploadBundle.js';
import { Request, Response } from 'express';

export const tusServer = new Server({
  path: '/api/files/upload',
  datastore: new S3Store({
    s3Client: minioService.getClient(),
    bucket: process.env.MINIO_BUCKET!,
    partSize: 5 * 1024 * 1024, // 5MB chunks
  }),

  // Extract custom metadata from upload headers
  namingFunction: (req) => {
    // Generate unique storage key
    const { userId, workId, bundleId, filename } = req.upload!.metadata!;
    return `${userId}/files/${workId}/${bundleId}/${filename}`;
  },

  // When upload is initiated
  async onUploadCreate(req: Request, res: Response, upload: Upload) {
    const metadata = upload.metadata!;
    const userId = parseInt(metadata.userId as string, 10);
    const workId = parseInt(metadata.workId as string, 10);

    // Create or get bundle
    let bundleId = metadata.bundleId as string;
    if (!bundleId) {
      bundleId = generateBundleId();

      await UploadBundleModel.create({
        bundleId,
        workId,
        userId,
        totalFiles: 1,
        totalSize: upload.size || 0,
        status: 'uploading',
      });
    } else {
      // Update existing bundle
      await UploadBundleModel.incrementFiles(bundleId, upload.size || 0);
    }

    // Create file record
    const file = await FileStorageModel.create({
      bundleId,
      workId,
      userId,
      filename: metadata.filename as string,
      originalName: metadata.originalName as string,
      displayName: metadata.displayName as string,
      fileSize: upload.size || 0,
      mimeType: metadata.mimeType as string || null,
      fileExtension: metadata.fileExtension as string || null,
      storageKey: `${userId}/files/${workId}/${bundleId}/${metadata.filename}`,
      tusId: upload.id,
      uploadStatus: 'uploading',
    });

    // Return augmented metadata
    return {
      ...metadata,
      bundleId,
      fileId: file.id,
    };
  },

  // Progress updates (called on each PATCH)
  async onUploadProgress(req: Request, res: Response, upload: Upload) {
    const { fileId } = upload.metadata!;
    const progress = Math.round((upload.offset / upload.size!) * 100);

    await FileStorageModel.updateProgress(
      parseInt(fileId as string, 10),
      upload.offset,
      progress
    );

    // Update bundle progress
    await UploadBundleModel.updateProgress(
      upload.metadata!.bundleId as string,
      upload.offset
    );
  },

  // When upload completes
  async onUploadFinish(req: Request, res: Response, upload: Upload) {
    const { fileId, bundleId } = upload.metadata!;

    // Mark file as completed
    await FileStorageModel.complete(parseInt(fileId as string, 10));

    // Check if bundle is complete
    const bundle = await UploadBundleModel.checkCompletion(bundleId as string);

    if (bundle.status === 'completed') {
      console.log(`Bundle ${bundleId} completed with ${bundle.completedFiles} files`);
      // Optional: Trigger post-processing (virus scan, thumbnail generation, etc.)
    }
  },

  // Max file size: 5GB
  maxSize: 5 * 1024 * 1024 * 1024,

  // Allow resumable uploads for 7 days
  expirationPeriodInMilliseconds: 7 * 24 * 60 * 60 * 1000,

  // Respect X-Forwarded-Host for CORS
  respectForwardedHeaders: true,
});

function generateBundleId(): string {
  const date = new Date().toISOString().split('T')[0];
  const random = require('crypto').randomBytes(4).toString('hex');
  return `${date}-${random}`;
}
```

### 5.3. Models

**File: `backend/src/models/UploadBundle.ts`**

```typescript
import { query } from '../config/database.js';

export interface UploadBundle {
  id: number;
  bundle_id: string;
  work_id: number;
  user_id: number;
  total_files: number;
  completed_files: number;
  total_size: number;
  uploaded_size: number;
  status: 'uploading' | 'completed' | 'failed' | 'abandoned';
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export class UploadBundleModel {
  static async create(data: {
    bundleId: string;
    workId: number;
    userId: number;
    totalFiles: number;
    totalSize: number;
    status: string;
  }): Promise<UploadBundle> {
    const result = await query<UploadBundle>(
      `INSERT INTO upload_bundles (bundle_id, work_id, user_id, total_files, total_size, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [data.bundleId, data.workId, data.userId, data.totalFiles, data.totalSize, data.status]
    );
    return result.rows[0];
  }

  static async incrementFiles(bundleId: string, fileSize: number): Promise<void> {
    await query(
      `UPDATE upload_bundles
       SET total_files = total_files + 1,
           total_size = total_size + $2
       WHERE bundle_id = $1`,
      [bundleId, fileSize]
    );
  }

  static async updateProgress(bundleId: string, bytesUploaded: number): Promise<void> {
    await query(
      `UPDATE upload_bundles
       SET uploaded_size = uploaded_size + $2
       WHERE bundle_id = $1`,
      [bundleId, bytesUploaded]
    );
  }

  static async checkCompletion(bundleId: string): Promise<UploadBundle> {
    // Count completed files
    const countResult = await query<{ count: number }>(
      `SELECT COUNT(*) as count FROM file_storage
       WHERE bundle_id = $1 AND upload_status = 'completed'`,
      [bundleId]
    );

    const completedCount = parseInt(countResult.rows[0].count.toString(), 10);

    // Get bundle
    const bundleResult = await query<UploadBundle>(
      `SELECT * FROM upload_bundles WHERE bundle_id = $1`,
      [bundleId]
    );
    const bundle = bundleResult.rows[0];

    // Update completion status
    if (completedCount === bundle.total_files) {
      await query(
        `UPDATE upload_bundles
         SET status = 'completed',
             completed_files = $2,
             completed_at = CURRENT_TIMESTAMP
         WHERE bundle_id = $1
         RETURNING *`,
        [bundleId, completedCount]
      );
      return { ...bundle, status: 'completed', completed_files: completedCount };
    }

    // Just update count
    await query(
      `UPDATE upload_bundles SET completed_files = $2 WHERE bundle_id = $1`,
      [bundleId, completedCount]
    );
    return { ...bundle, completed_files: completedCount };
  }

  static async findByWorkId(workId: number, userId: number): Promise<UploadBundle[]> {
    const result = await query<UploadBundle>(
      `SELECT * FROM upload_bundles
       WHERE work_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  static async delete(bundleId: string, userId: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM upload_bundles
       WHERE bundle_id = $1 AND user_id = $2`,
      [bundleId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
```

**File: `backend/src/models/FileStorage.ts`**

```typescript
import { query } from '../config/database.js';

export interface FileStorageRecord {
  id: number;
  bundle_id: string;
  work_id: number;
  user_id: number;
  filename: string;
  original_name: string;
  display_name: string;
  file_size: number;
  mime_type: string | null;
  file_extension: string | null;
  storage_key: string;
  tus_id: string | null;
  upload_status: 'uploading' | 'completed' | 'failed' | 'cancelled';
  upload_progress: number;
  uploaded_bytes: number;
  error_message: string | null;
  retry_count: number;
  uploaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class FileStorageModel {
  static async create(data: {
    bundleId: string;
    workId: number;
    userId: number;
    filename: string;
    originalName: string;
    displayName: string;
    fileSize: number;
    mimeType: string | null;
    fileExtension: string | null;
    storageKey: string;
    tusId: string | null;
    uploadStatus: string;
  }): Promise<FileStorageRecord> {
    const result = await query<FileStorageRecord>(
      `INSERT INTO file_storage
        (bundle_id, work_id, user_id, filename, original_name, display_name,
         file_size, mime_type, file_extension, storage_key, tus_id, upload_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        data.bundleId, data.workId, data.userId, data.filename,
        data.originalName, data.displayName, data.fileSize,
        data.mimeType, data.fileExtension, data.storageKey,
        data.tusId, data.uploadStatus
      ]
    );
    return result.rows[0];
  }

  static async updateProgress(
    fileId: number,
    uploadedBytes: number,
    progress: number
  ): Promise<void> {
    await query(
      `UPDATE file_storage
       SET uploaded_bytes = $2, upload_progress = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId, uploadedBytes, progress]
    );
  }

  static async complete(fileId: number): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'completed',
           upload_progress = 100,
           uploaded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId]
    );
  }

  static async fail(fileId: number, errorMessage: string): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'failed',
           error_message = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId, errorMessage]
    );
  }

  static async cancel(fileId: number): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId]
    );
  }

  static async findByWorkId(workId: number, userId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1 AND user_id = $2 AND upload_status = 'completed'
       ORDER BY uploaded_at DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  static async findByBundleId(bundleId: string, userId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE bundle_id = $1 AND user_id = $2
       ORDER BY created_at ASC`,
      [bundleId, userId]
    );
    return result.rows;
  }

  static async findById(fileId: number, userId: number): Promise<FileStorageRecord | null> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    return result.rows[0] || null;
  }

  static async delete(fileId: number, userId: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM file_storage
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}
```

### 5.4. API Routes

**File: `backend/src/routes/fileStorage.ts`**

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { UploadBundleModel } from '../models/UploadBundle.js';
import { minioService } from '../services/minioService.js';
import { tusServer } from '../services/tusService.js';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// tus upload endpoint (handles POST, HEAD, PATCH, DELETE for resumable uploads)
router.all('/upload', (req, res) => {
  return tusServer.handle(req, res);
});
router.all('/upload/:id', (req, res) => {
  return tusServer.handle(req, res);
});

// List all files for a work
router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    const files = await FileStorageModel.findByWorkId(workId, userId);
    res.json(files);
  } catch (error) {
    next(error);
  }
});

// Get file metadata
router.get('/:fileId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    const file = await FileStorageModel.findById(fileId, userId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json(file);
  } catch (error) {
    next(error);
  }
});

// Download file
router.get('/:fileId/download', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    const file = await FileStorageModel.findById(fileId, userId);
    if (!file || file.upload_status !== 'completed') {
      return res.status(404).json({ error: 'File not found or not ready' });
    }

    // User isolation check
    const parts = file.storage_key.split('/');
    const fileUserId = parseInt(parts[0], 10);
    if (fileUserId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get file from MinIO
    const { buffer, contentType } = await minioService.getFile(file.storage_key);

    // Set download headers
    res.set({
      'Content-Type': contentType,
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.display_name)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0',
    });

    res.send(buffer);
  } catch (error) {
    next(error);
  }
});

// Delete file
router.delete('/:fileId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    // Get file to delete from MinIO
    const file = await FileStorageModel.findById(fileId, userId);
    if (file) {
      // Delete from MinIO
      if (file.upload_status === 'completed') {
        await minioService.deleteFile(file.storage_key);
      }

      // Delete from database
      await FileStorageModel.delete(fileId, userId);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Delete entire bundle
router.delete('/bundle/:bundleId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const bundleId = req.params.bundleId;

    // Get all files in bundle
    const files = await FileStorageModel.findByBundleId(bundleId, userId);

    // Delete completed files from MinIO
    const deletePromises = files
      .filter(f => f.upload_status === 'completed')
      .map(f => minioService.deleteFile(f.storage_key));

    await Promise.all(deletePromises);

    // Delete bundle (cascades to files)
    await UploadBundleModel.delete(bundleId, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
```

### 5.5. Mount Routes

**File: `backend/src/index.ts`** (add to existing file)

```typescript
import fileStorageRoutes from './routes/fileStorage.js';

// After other routes
app.use('/api/files', fileStorageRoutes);
```

---

## 6. Frontend Upload Queue Manager

### 6.1. Dependencies

```json
// frontend/package.json additions
{
  "dependencies": {
    "tus-js-client": "^3.1.0",
    "jszip": "^3.10.1",
    "zustand": "^4.4.0",
    "file-icon-vectors": "^1.0.0"
  }
}
```

### 6.2. Upload Queue Store (Zustand)

**File: `frontend/src/stores/uploadQueueStore.ts`**

```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface UploadItem {
  id: string; // Unique upload ID (generated client-side)
  file: File;
  workId: number;
  bundleId: string;

  // Status
  status: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled' | 'paused';
  progress: number; // 0-100
  uploadedBytes: number;
  totalBytes: number;
  speed: number; // Bytes per second

  // tus client instance (for pause/resume)
  tusUpload?: any;

  // Timestamps
  startedAt?: Date;
  completedAt?: Date;

  // Error
  error?: string;
  retryCount: number;
}

interface UploadQueueStore {
  // Queue state
  uploads: Map<string, UploadItem>;
  bundleId: string | null;

  // Queue management
  addUpload: (file: File, workId: number, bundleId?: string) => string;
  removeUpload: (uploadId: string) => void;
  clearCompleted: () => void;
  cancelAll: () => void;

  // Upload control
  startUpload: (uploadId: string, tusUpload: any) => void;
  pauseUpload: (uploadId: string) => void;
  resumeUpload: (uploadId: string) => void;
  cancelUpload: (uploadId: string) => void;
  retryUpload: (uploadId: string) => void;

  // Progress updates
  updateProgress: (uploadId: string, progress: number, uploadedBytes: number, speed: number) => void;
  setCompleted: (uploadId: string) => void;
  setFailed: (uploadId: string, error: string) => void;

  // Computed
  getTotalProgress: () => number;
  getActiveUploads: () => UploadItem[];
  isUploading: () => boolean;
}

export const useUploadQueue = create<UploadQueueStore>()(
  devtools(
    (set, get) => ({
      uploads: new Map(),
      bundleId: null,

      addUpload: (file, workId, bundleId) => {
        const id = generateUploadId();
        const currentBundleId = bundleId || get().bundleId || generateBundleId();

        set((state) => {
          const newUploads = new Map(state.uploads);
          newUploads.set(id, {
            id,
            file,
            workId,
            bundleId: currentBundleId,
            status: 'pending',
            progress: 0,
            uploadedBytes: 0,
            totalBytes: file.size,
            speed: 0,
            retryCount: 0,
          });

          return {
            uploads: newUploads,
            bundleId: currentBundleId,
          };
        });

        return id;
      },

      removeUpload: (uploadId) => {
        set((state) => {
          const newUploads = new Map(state.uploads);

          // Cancel tus upload if active
          const upload = newUploads.get(uploadId);
          if (upload?.tusUpload) {
            upload.tusUpload.abort();
          }

          newUploads.delete(uploadId);
          return { uploads: newUploads };
        });
      },

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

      cancelAll: () => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          for (const [id, upload] of newUploads) {
            if (upload.tusUpload && upload.status === 'uploading') {
              upload.tusUpload.abort();
            }
            if (upload.status !== 'completed') {
              upload.status = 'cancelled';
            }
          }
          return { uploads: newUploads };
        });
      },

      startUpload: (uploadId, tusUpload) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.status = 'uploading';
            upload.tusUpload = tusUpload;
            upload.startedAt = new Date();
          }
          return { uploads: newUploads };
        });
      },

      pauseUpload: (uploadId) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload?.tusUpload) {
            upload.tusUpload.abort(true); // Abort but keep for resume
            upload.status = 'paused';
          }
          return { uploads: newUploads };
        });
      },

      resumeUpload: (uploadId) => {
        // Implementation requires recreating tus upload with same file
        // This will be handled in the component layer
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.status = 'pending';
          }
          return { uploads: newUploads };
        });
      },

      cancelUpload: (uploadId) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload?.tusUpload) {
            upload.tusUpload.abort();
            upload.status = 'cancelled';
          }
          return { uploads: newUploads };
        });
      },

      retryUpload: (uploadId) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.status = 'pending';
            upload.error = undefined;
            upload.retryCount += 1;
            upload.progress = 0;
            upload.uploadedBytes = 0;
          }
          return { uploads: newUploads };
        });
      },

      updateProgress: (uploadId, progress, uploadedBytes, speed) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.progress = progress;
            upload.uploadedBytes = uploadedBytes;
            upload.speed = speed;
          }
          return { uploads: newUploads };
        });
      },

      setCompleted: (uploadId) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.status = 'completed';
            upload.progress = 100;
            upload.completedAt = new Date();
          }
          return { uploads: newUploads };
        });
      },

      setFailed: (uploadId, error) => {
        set((state) => {
          const newUploads = new Map(state.uploads);
          const upload = newUploads.get(uploadId);
          if (upload) {
            upload.status = 'failed';
            upload.error = error;
          }
          return { uploads: newUploads };
        });
      },

      getTotalProgress: () => {
        const uploads = Array.from(get().uploads.values());
        if (uploads.length === 0) return 0;

        const totalBytes = uploads.reduce((sum, u) => sum + u.totalBytes, 0);
        const uploadedBytes = uploads.reduce((sum, u) => sum + u.uploadedBytes, 0);

        return Math.round((uploadedBytes / totalBytes) * 100);
      },

      getActiveUploads: () => {
        return Array.from(get().uploads.values())
          .filter(u => u.status === 'uploading' || u.status === 'pending');
      },

      isUploading: () => {
        return Array.from(get().uploads.values())
          .some(u => u.status === 'uploading' || u.status === 'pending');
      },
    }),
    { name: 'UploadQueue' }
  )
);

function generateUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateBundleId(): string {
  const date = new Date().toISOString().split('T')[0];
  const random = Math.random().toString(36).substr(2, 8);
  return `${date}-${random}`;
}
```

### 6.3. Upload Manager Hook

**File: `frontend/src/hooks/useFileUpload.ts`**

```typescript
import { useCallback, useEffect, useRef } from 'react';
import * as tus from 'tus-js-client';
import { useUploadQueue } from '../stores/uploadQueueStore';
import { useQueryClient } from '@tanstack/react-query';

const API_URL = import.meta.env.VITE_API_URL || window.location.origin;
const MAX_CONCURRENT_UPLOADS = 3; // Upload 3 files at once

export function useFileUpload(workId: number) {
  const {
    addUpload,
    startUpload,
    updateProgress,
    setCompleted,
    setFailed,
    getActiveUploads,
  } = useUploadQueue();

  const queryClient = useQueryClient();
  const activeUploadsRef = useRef(0);
  const queueCheckInterval = useRef<NodeJS.Timeout | null>(null);

  // Start next upload from queue if slot available
  const processQueue = useCallback(() => {
    const uploads = getActiveUploads();
    const pendingUploads = uploads.filter(u => u.status === 'pending');

    if (activeUploadsRef.current < MAX_CONCURRENT_UPLOADS && pendingUploads.length > 0) {
      const nextUpload = pendingUploads[0];
      startTusUpload(nextUpload.id, nextUpload.file, nextUpload.bundleId);
    }
  }, [getActiveUploads]);

  // Start queue processor
  useEffect(() => {
    queueCheckInterval.current = setInterval(processQueue, 500);
    return () => {
      if (queueCheckInterval.current) {
        clearInterval(queueCheckInterval.current);
      }
    };
  }, [processQueue]);

  // Start tus upload for a specific file
  const startTusUpload = useCallback((uploadId: string, file: File, bundleId: string) => {
    const startTime = Date.now();
    let lastUploadedBytes = 0;

    const upload = new tus.Upload(file, {
      endpoint: `${API_URL}/api/files/upload`,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 5 * 1024 * 1024, // 5MB chunks
      metadata: {
        filename: sanitizeFilename(file.name),
        originalName: file.name,
        displayName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileExtension: getFileExtension(file.name),
        workId: workId.toString(),
        bundleId,
        userId: 'from-session', // Server will extract from session
      },

      onError: (error) => {
        console.error('Upload failed:', error);
        setFailed(uploadId, error.message);
        activeUploadsRef.current--;
        processQueue();

        // Invalidate queries to refresh file list
        queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
      },

      onProgress: (bytesUploaded, bytesTotal) => {
        const progress = Math.round((bytesUploaded / bytesTotal) * 100);

        // Calculate speed
        const elapsed = (Date.now() - startTime) / 1000; // seconds
        const speed = elapsed > 0 ? (bytesUploaded - lastUploadedBytes) / elapsed : 0;
        lastUploadedBytes = bytesUploaded;

        updateProgress(uploadId, progress, bytesUploaded, speed);
      },

      onSuccess: () => {
        console.log('Upload completed:', file.name);
        setCompleted(uploadId);
        activeUploadsRef.current--;
        processQueue();

        // Invalidate queries to refresh file list
        queryClient.invalidateQueries({ queryKey: ['files', 'work', workId] });
      },
    });

    // Start upload
    activeUploadsRef.current++;
    startUpload(uploadId, upload);
    upload.start();
  }, [workId, updateProgress, setCompleted, setFailed, startUpload, processQueue, queryClient]);

  // Add files to queue
  const queueFiles = useCallback((files: File[]) => {
    const bundleId = generateBundleId();

    for (const file of files) {
      addUpload(file, workId, bundleId);
    }

    // Trigger queue processing
    processQueue();
  }, [workId, addUpload, processQueue]);

  return {
    queueFiles,
  };
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars
    .replace(/\s+/g, '_') // Replace spaces
    .substring(0, 255); // Limit length
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function generateBundleId(): string {
  const date = new Date().toISOString().split('T')[0];
  const random = Math.random().toString(36).substr(2, 8);
  return `${date}-${random}`;
}
```

---

## 7. Progress Tracking UI

### 7.1. Upload Progress Panel Component

**File: `frontend/src/components/UploadProgressPanel.tsx`**

```typescript
import React from 'react';
import { useUploadQueue } from '../stores/uploadQueueStore';
import { X, Pause, Play, RotateCcw, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatBytes, formatSpeed } from '../utils/formatters';

export default function UploadProgressPanel() {
  const {
    uploads,
    getTotalProgress,
    isUploading,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    retryUpload,
    removeUpload,
    clearCompleted,
    cancelAll,
  } = useUploadQueue();

  const uploadArray = Array.from(uploads.values());
  const totalProgress = getTotalProgress();

  if (uploadArray.length === 0) return null;

  const activeCount = uploadArray.filter(u =>
    u.status === 'uploading' || u.status === 'pending'
  ).length;

  const completedCount = uploadArray.filter(u => u.status === 'completed').length;
  const failedCount = uploadArray.filter(u => u.status === 'failed').length;

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-dark-surface border border-dark-border rounded-lg shadow-xl z-50">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-dark-border">
        <div>
          <h3 className="text-sm font-semibold text-gray-100">
            Uploading Files
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {activeCount} active • {completedCount} completed • {failedCount} failed
          </p>
        </div>
        <div className="flex items-center space-x-2">
          {completedCount > 0 && (
            <button
              onClick={clearCompleted}
              className="text-xs text-gray-400 hover:text-gray-200"
            >
              Clear
            </button>
          )}
          {isUploading() && (
            <button
              onClick={cancelAll}
              className="text-xs text-red-400 hover:text-red-300"
            >
              Cancel All
            </button>
          )}
        </div>
      </div>

      {/* Overall Progress */}
      {isUploading() && (
        <div className="p-4 border-b border-dark-border">
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>Overall Progress</span>
            <span>{totalProgress}%</span>
          </div>
          <div className="w-full bg-dark-bg rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Upload List */}
      <div className="max-h-96 overflow-y-auto">
        {uploadArray.map((upload) => (
          <UploadItem
            key={upload.id}
            upload={upload}
            onPause={() => pauseUpload(upload.id)}
            onResume={() => resumeUpload(upload.id)}
            onCancel={() => cancelUpload(upload.id)}
            onRetry={() => retryUpload(upload.id)}
            onRemove={() => removeUpload(upload.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface UploadItemProps {
  upload: any;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}

function UploadItem({ upload, onPause, onResume, onCancel, onRetry, onRemove }: UploadItemProps) {
  const getStatusIcon = () => {
    switch (upload.status) {
      case 'uploading':
        return <Loader2 className="animate-spin text-blue-400" size={16} />;
      case 'completed':
        return <CheckCircle className="text-green-400" size={16} />;
      case 'failed':
        return <XCircle className="text-red-400" size={16} />;
      case 'paused':
        return <Pause className="text-yellow-400" size={16} />;
      default:
        return <Loader2 className="text-gray-400" size={16} />;
    }
  };

  return (
    <div className="p-4 border-b border-dark-border hover:bg-dark-hover transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          {getStatusIcon()}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-200 truncate">{upload.file.name}</p>
            <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
              <span>{formatBytes(upload.totalBytes)}</span>
              {upload.status === 'uploading' && (
                <>
                  <span>•</span>
                  <span>{formatSpeed(upload.speed)}</span>
                </>
              )}
              {upload.error && (
                <>
                  <span>•</span>
                  <span className="text-red-400">{upload.error}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-1 ml-2">
          {upload.status === 'uploading' && (
            <button onClick={onPause} className="p-1 hover:bg-dark-surface rounded">
              <Pause size={14} className="text-gray-400" />
            </button>
          )}
          {upload.status === 'paused' && (
            <button onClick={onResume} className="p-1 hover:bg-dark-surface rounded">
              <Play size={14} className="text-gray-400" />
            </button>
          )}
          {upload.status === 'failed' && (
            <button onClick={onRetry} className="p-1 hover:bg-dark-surface rounded">
              <RotateCcw size={14} className="text-gray-400" />
            </button>
          )}
          {(upload.status === 'uploading' || upload.status === 'pending') && (
            <button onClick={onCancel} className="p-1 hover:bg-dark-surface rounded">
              <X size={14} className="text-red-400" />
            </button>
          )}
          {(upload.status === 'completed' || upload.status === 'cancelled' || upload.status === 'failed') && (
            <button onClick={onRemove} className="p-1 hover:bg-dark-surface rounded">
              <X size={14} className="text-gray-400" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(upload.status === 'uploading' || upload.status === 'pending') && (
        <div className="mt-2">
          <div className="w-full bg-dark-bg rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${upload.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

### 7.2. Format Utilities

**File: `frontend/src/utils/formatters.ts`** (add to existing or create new)

```typescript
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
```

---

## 8. Cleanup & Cancellation Mechanisms

### 8.1. Abandoned Upload Cleanup (Backend)

**File: `backend/src/jobs/cleanupAbandonedUploads.ts`**

```typescript
import { query } from '../config/database.js';
import { minioService } from '../services/minioService.js';

/**
 * Cleanup abandoned uploads (created > 24h ago, still status 'uploading')
 * Run this as a cron job daily
 */
export async function cleanupAbandonedUploads() {
  console.log('Starting abandoned upload cleanup...');

  // Find bundles older than 24 hours still in 'uploading' status
  const result = await query<{ bundle_id: string }>(
    `UPDATE upload_bundles
     SET status = 'abandoned'
     WHERE status = 'uploading'
     AND created_at < NOW() - INTERVAL '24 hours'
     RETURNING bundle_id`
  );

  const abandonedBundles = result.rows;

  if (abandonedBundles.length === 0) {
    console.log('No abandoned uploads found');
    return;
  }

  console.log(`Found ${abandonedBundles.length} abandoned upload bundles`);

  // Get all incomplete files in these bundles
  for (const bundle of abandonedBundles) {
    const filesResult = await query<{ storage_key: string }>(
      `SELECT storage_key FROM file_storage
       WHERE bundle_id = $1
       AND upload_status IN ('uploading', 'pending', 'failed')`,
      [bundle.bundle_id]
    );

    // Delete incomplete files from MinIO (best effort)
    for (const file of filesResult.rows) {
      try {
        await minioService.deleteFile(file.storage_key);
        console.log(`Deleted abandoned file: ${file.storage_key}`);
      } catch (error) {
        console.error(`Failed to delete ${file.storage_key}:`, error);
        // Continue cleanup even if some files fail
      }
    }

    // Mark files as cancelled
    await query(
      `UPDATE file_storage
       SET upload_status = 'cancelled'
       WHERE bundle_id = $1
       AND upload_status IN ('uploading', 'pending', 'failed')`,
      [bundle.bundle_id]
    );
  }

  console.log('Abandoned upload cleanup completed');
}

// Run cleanup every 6 hours
setInterval(cleanupAbandonedUploads, 6 * 60 * 60 * 1000);
```

### 8.2. Frontend: beforeunload Handler

**File: `frontend/src/hooks/useUploadWarning.ts`**

```typescript
import { useEffect } from 'react';
import { useUploadQueue } from '../stores/uploadQueueStore';

/**
 * Warn user before leaving page if uploads are in progress
 */
export function useUploadWarning() {
  const isUploading = useUploadQueue(state => state.isUploading());

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isUploading) {
        e.preventDefault();
        e.returnValue = 'Uploads are still in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isUploading]);
}
```

### 8.3. Cancel on Work Deletion

When a work is deleted, cascade to upload_bundles → file_storage, then cleanup MinIO:

**In `backend/src/routes/works.ts` delete handler:**

```typescript
// ... existing work deletion code

// Get all file storage keys to delete from MinIO
const fileKeysResult = await query<{ storage_key: string }>(
  `SELECT storage_key FROM file_storage WHERE work_id = $1`,
  [id]
);

const fileKeys = fileKeysResult.rows.map(r => r.storage_key);

if (fileKeys.length > 0) {
  await minioService.deleteFiles(fileKeys);
  console.log(`Cleaned up ${fileKeys.length} storage file(s) from deleted work ${id}`);
}

// Delete work (CASCADE handles database cleanup)
const deleted = await WorkModel.delete(id, userId);
```

---

## 9. File Icon Integration

### 9.1. Install file-icon-vectors

```bash
npm install file-icon-vectors
```

### 9.2. File Icon Component

**File: `frontend/src/components/FileIcon.tsx`**

```typescript
import React from 'react';

interface FileIconProps {
  filename: string;
  mimeType?: string | null;
  size?: number;
  className?: string;
}

/**
 * Uses file-icon-vectors library
 * Icon path format: /node_modules/file-icon-vectors/dist/icons/classic/${extension}.svg
 */
export default function FileIcon({
  filename,
  mimeType,
  size = 24,
  className = ''
}: FileIconProps) {
  const extension = getFileExtension(filename).toLowerCase();

  // Map common extensions to icon names
  const iconName = getIconName(extension, mimeType);

  // Use file-icon-vectors classic set
  const iconPath = `/file-icons/classic/${iconName}.svg`;

  return (
    <img
      src={iconPath}
      alt={`${extension} file`}
      width={size}
      height={size}
      className={className}
      onError={(e) => {
        // Fallback to generic file icon
        (e.target as HTMLImageElement).src = '/file-icons/classic/file.svg';
      }}
    />
  );
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1] : 'file';
}

function getIconName(extension: string, mimeType?: string | null): string {
  // Special handling for common types
  const iconMap: Record<string, string> = {
    // Documents
    'pdf': 'pdf',
    'doc': 'doc',
    'docx': 'doc',
    'xls': 'xls',
    'xlsx': 'xls',
    'ppt': 'ppt',
    'pptx': 'ppt',
    'txt': 'txt',
    'md': 'md',
    'rtf': 'rtf',

    // Images
    'jpg': 'jpg',
    'jpeg': 'jpg',
    'png': 'png',
    'gif': 'gif',
    'svg': 'svg',
    'webp': 'webp',
    'psd': 'psd',
    'ai': 'ai',
    'sketch': 'sketch',
    'fig': 'figma',

    // Video
    'mp4': 'mp4',
    'mov': 'mov',
    'avi': 'avi',
    'mkv': 'mkv',

    // Audio
    'mp3': 'mp3',
    'wav': 'wav',
    'flac': 'flac',

    // Archives
    'zip': 'zip',
    'rar': 'rar',
    '7z': '7z',
    'tar': 'tar',
    'gz': 'gz',

    // Code
    'js': 'js',
    'ts': 'ts',
    'jsx': 'jsx',
    'tsx': 'tsx',
    'py': 'py',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'xml': 'xml',
    'yml': 'yaml',
    'yaml': 'yaml',

    // 3D/Creative
    'blend': 'blend',
    'max': '3ds',
    'fbx': 'fbx',
    'obj': 'obj',
    'stl': 'stl',
    'spp': 'substance', // Substance Painter
    'sbs': 'substance', // Substance Designer
  };

  return iconMap[extension] || 'file';
}
```

### 9.3. Copy Icons to Public Folder

Add to build process or manual copy:

```bash
# Copy file-icon-vectors to public/file-icons
cp -r node_modules/file-icon-vectors/dist/icons public/file-icons
```

Or use Vite public folder to serve from CDN.

---

## 10. Error Handling & Retry Logic

### tus Built-in Retry
tus-js-client has automatic retry with exponential backoff:

```typescript
retryDelays: [0, 1000, 3000, 5000] // 0s, 1s, 3s, 5s
```

### Application-Level Retry

For failed uploads after all tus retries exhausted:

```typescript
// In UploadProgressPanel
<button onClick={() => retryUpload(upload.id)}>
  Retry Upload
</button>

// In useFileUpload
const retryFailedUpload = (uploadId: string) => {
  const upload = uploads.get(uploadId);
  if (upload && upload.status === 'failed') {
    // Reset status and restart
    startTusUpload(uploadId, upload.file, upload.bundleId);
  }
};
```

### Error Categories

1. **Network Errors**: Handled by tus auto-retry
2. **Authentication Errors**: Show re-login prompt
3. **File Size Errors**: Show clear message before upload
4. **Storage Errors**: Retry with exponential backoff
5. **Unknown Errors**: Log to console, show generic message

---

## 11. Implementation Phases

### Phase 1: Backend Foundation (Week 1)
- [ ] Install tus packages (@tus/server, @tus/s3-store)
- [ ] Create database migrations (upload_bundles, file_storage)
- [ ] Implement UploadBundle and FileStorage models
- [ ] Setup tus server with S3 store
- [ ] Create file storage API routes
- [ ] Test chunked upload with Postman/curl
- [ ] Update work deletion to cleanup files

### Phase 2: Frontend Upload Manager (Week 2)
- [ ] Install frontend packages (tus-js-client, zustand, jszip, file-icon-vectors)
- [ ] Create upload queue store (Zustand)
- [ ] Implement useFileUpload hook
- [ ] Build UploadProgressPanel component
- [ ] Create FileIcon component
- [ ] Test with small files (<100MB)

### Phase 3: UI Integration (Week 3)
- [ ] Create FileStorageSection component
- [ ] Create FileListItem component (slim design)
- [ ] Create FileUploadModal with drag-drop
- [ ] Integrate into WorkDetail page
- [ ] Add folder-to-zip functionality (JSZip)
- [ ] Style to match existing UI patterns

### Phase 4: Large File Testing (Week 4)
- [ ] Test with 1GB files
- [ ] Test with 5GB files
- [ ] Test multiple concurrent uploads
- [ ] Test pause/resume functionality
- [ ] Test network interruption scenarios
- [ ] Test browser refresh during upload

### Phase 5: Polish & Deployment (Week 5)
- [ ] Implement abandoned upload cleanup job
- [ ] Add beforeunload warning
- [ ] Optimize progress update frequency
- [ ] Add file search/filter in UI
- [ ] Write user documentation
- [ ] Deploy to production
- [ ] Monitor for errors

---

## 12. Testing Checklist

### Unit Tests
- [ ] UploadBundle model CRUD
- [ ] FileStorage model CRUD
- [ ] Bundle ID generation uniqueness
- [ ] Filename sanitization
- [ ] File extension extraction

### Integration Tests
- [ ] tus upload endpoint (POST, PATCH, HEAD)
- [ ] Chunk upload and assembly
- [ ] Progress tracking accuracy
- [ ] Completion webhook triggers
- [ ] Cascade deletion (work → bundles → files → MinIO)

### E2E Tests
- [ ] Upload single file (100MB)
- [ ] Upload multiple files simultaneously
- [ ] Upload duplicate filename (same work)
- [ ] Pause and resume upload
- [ ] Cancel upload mid-flight
- [ ] Refresh browser during upload (resume after)
- [ ] Delete file after upload
- [ ] Delete work with files
- [ ] Upload folder (auto-zip)
- [ ] Download file
- [ ] View file list

### Load Tests
- [ ] 10 concurrent 1GB uploads
- [ ] 100 files queued
- [ ] 5GB single file upload
- [ ] Network throttling (slow 3G)
- [ ] Connection drop and recovery

---

## 13. Monitoring & Observability

### Metrics to Track
- Total upload bytes/day
- Average upload speed
- Upload success rate
- Upload failure reasons
- Abandoned upload count
- Storage space used per user/work
- Active uploads at any time

### Logging
```typescript
// Backend
console.log(`[Upload] Started: ${filename} (${fileSize} bytes)`);
console.log(`[Upload] Progress: ${filename} ${progress}%`);
console.log(`[Upload] Completed: ${filename} in ${duration}ms`);
console.error(`[Upload] Failed: ${filename}`, error);

// Frontend
console.log(`[Queue] Added ${files.length} files to upload`);
console.log(`[Queue] Active uploads: ${activeCount}/${MAX_CONCURRENT}`);
console.log(`[tus] Upload ${uploadId} progress: ${progress}%`);
```

---

## 14. Security Considerations

### 1. No MIME Filtering (As Requested)
- ✅ Allow all file types
- ✅ Still validate file size (5GB max)
- ✅ Sanitize filenames to prevent path traversal
- ⚠️ **Risk**: Malicious files can be uploaded
- **Mitigation**: User-isolated storage, no public access, download-only (not execute)

### 2. User Isolation
- Every storage key starts with `${userId}/`
- Database queries always filter by `user_id` from session
- Download endpoint validates ownership

### 3. Storage Quotas (Future Enhancement)
Consider adding per-user or per-work storage limits:
```sql
ALTER TABLE users ADD COLUMN storage_quota_bytes BIGINT DEFAULT 107374182400; -- 100GB
ALTER TABLE users ADD COLUMN storage_used_bytes BIGINT DEFAULT 0;
```

### 4. Content-Security-Policy Headers
When serving files, prevent execution:
```typescript
'Content-Security-Policy': "default-src 'none'",
'X-Content-Type-Options': 'nosniff',
```

### 5. Rate Limiting
Add rate limits to upload endpoints:
- Max 100 files per hour per user
- Max 50GB uploaded per day per user

---

## 15. Summary

This implementation plan provides a **production-grade file storage system** with:

✅ **5GB file support** via tus chunked uploads
✅ **Duplicate filenames** via upload bundle UIDs
✅ **No MIME filtering** - all file types allowed
✅ **Multi-file concurrent uploads** with queue management (max 3 simultaneous)
✅ **Real-time progress bars** per file and overall
✅ **Resumable uploads** survive network failures and browser refreshes
✅ **Safe cleanup** via abandoned upload jobs
✅ **Cancel anytime** with proper cleanup
✅ **Professional UI** with file icons, drag-drop, and responsive feedback

**Key Technologies:**
- **Backend**: tus protocol with S3 store, PostgreSQL metadata
- **Frontend**: tus-js-client, Zustand state, JSZip compression
- **Icons**: file-icon-vectors library
- **Storage**: MinIO with upload bundles

**Estimated Timeline**: 5 weeks for full implementation and testing

This architecture matches the upload experience of professional platforms like Dropbox, Google Drive, and WeTransfer, while being fully integrated into the WorkCounter workflow.

---

**Next Steps**: Review this plan, provide feedback, and begin Phase 1 implementation.
