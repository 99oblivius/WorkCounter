import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { minioService } from '../services/minioService.js';
import { tusServer } from '../services/tusService.js';
import { RoleService } from '../services/roleService.js';
import { sseService } from '../services/sseService.js';

const router = Router();

// SECURITY: Rate limiting for file operations to prevent abuse
const fileUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 uploads per 15 minutes per IP
  message: { error: 'Too many file uploads, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const fileDownloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 downloads per minute per IP
  message: { error: 'Too many download requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const fileDeleteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 deletions per 5 minutes per IP
  message: { error: 'Too many delete requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to check auth and permissions for tus, and restore original res.end (session middleware wraps it)
const tusAuthCheck = async (req: any, res: any, next: any) => {
  if (!req.session?.user?.userId) {
    console.error('[tus route] Unauthorized upload attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // SECURITY: Check if user has files.upload permission
  try {
    const hasPermission = await RoleService.userHasPermission(
      req.session.user.userId,
      'files.upload'
    );

    if (!hasPermission) {
      console.error(`[tus route] User ${req.session.user.userId} lacks files.upload permission`);
      return res.status(403).json({
        error: 'File upload not permitted. Contact administrator for access.'
      });
    }
  } catch (error) {
    console.error('[tus route] Error checking permission:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // CRITICAL: Restore the original res.end that was wrapped by express-session
  // This prevents session middleware from interfering with tus/srvx response handling
  if ((res as any)._originalEnd) {
    res.end = (res as any)._originalEnd;
  }

  next();
};

// tus upload endpoints - auth checked but session response wrapping removed
// POST /api/files/upload - Create new upload
// HEAD /api/files/upload/:id - Check upload status
// PATCH /api/files/upload/:id - Upload chunk
// DELETE /api/files/upload/:id - Cancel upload (not exposed to frontend)
// SECURITY: Apply rate limiting to uploads
router.all('/upload', fileUploadLimiter, tusAuthCheck, (req, res) => {
  return tusServer.handle(req, res);
});

router.all('/upload/*', fileUploadLimiter, tusAuthCheck, (req, res) => {
  return tusServer.handle(req, res);
});

// All other routes require authentication
router.use(requireAuth);

// Get all files for a work (completed only) - requires view access to work
router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    // Check work access
    const access = await WorkAccessService.checkAccess(userId, workId);
    if (!access.canView) {
      return res.status(403).json({ error: 'Cannot view this work' });
    }

    // Return ALL files for this work, not just user's
    const files = await FileStorageModel.findByWorkIdWithAccess(workId);
    res.json(files);
  } catch (error) {
    next(error);
  }
});

// Get all files for a work (including in-progress) - requires view access to work
router.get('/work/:workId/all', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    // Check work access
    const access = await WorkAccessService.checkAccess(userId, workId);
    if (!access.canView) {
      return res.status(403).json({ error: 'Cannot view this work' });
    }

    // Return ALL files for this work, not just user's
    const files = await FileStorageModel.findAllByWorkIdWithAccess(workId);
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
// SECURITY: Apply rate limiting to downloads
router.get('/:fileId/download', fileDownloadLimiter, async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    const file = await FileStorageModel.findById(fileId, userId);
    if (!file || file.upload_status !== 'completed') {
      return res.status(404).json({ error: 'File not found or not ready' });
    }

    // User isolation check (validate storage key starts with userId)
    const parts = file.storage_key.split('/');
    const fileUserId = parseInt(parts[0], 10);
    if (fileUserId !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    console.log(`[Download] User ${userId} downloading file ${fileId}: ${file.display_name}`);

    // Get file from MinIO
    const { buffer, contentType } = await minioService.getFile(file.storage_key);

    // Set download headers
    res.set({
      'Content-Type': file.mime_type || contentType || 'application/octet-stream',
      'Content-Length': buffer.length.toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.display_name)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0',
    });

    res.send(buffer);
  } catch (error) {
    console.error('[Download] Error:', error);
    next(error);
  }
});

// Delete file
// SECURITY: Apply rate limiting to deletions
router.delete('/:fileId', fileDeleteLimiter, async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    console.log(`[Delete] User ${userId} deleting file ${fileId}`);

    // Get file to delete
    const file = await FileStorageModel.findById(fileId, userId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // SECURITY: Check if user has edit access to the work
    const workAccess = await WorkAccessService.checkAccess(userId, file.work_id);
    if (!workAccess.canEdit) {
      return res.status(403).json({
        error: 'Cannot delete this file. Edit permission required on the work.'
      });
    }

    if (file) {
      // Delete tus metadata (.info file) if it exists
      try {
        await tusServer.datastore.remove(file.storage_key);
        console.log(`[Delete] Removed tus metadata: ${file.storage_key}`);
      } catch (err) {
        console.log(`[Delete] No tus metadata to remove: ${err}`);
      }

      // Delete from MinIO if upload was completed
      if (file.upload_status === 'completed') {
        await minioService.deleteFile(file.storage_key);
        console.log(`[Delete] Removed from MinIO: ${file.storage_key}`);
      }

      // Delete from database
      await FileStorageModel.delete(fileId, userId);
      console.log(`[Delete] Removed from database: ${fileId}`);

      // Emit SSE event for real-time updates
      await sseService.emitWorkUpdate(file.work_id, 'file:delete', { id: fileId });
    }

    res.status(204).send();
  } catch (error) {
    console.error('[Delete] Error:', error);
    next(error);
  }
});

// Cancel upload (delete tus upload, delete partial file, delete database entry)
// SECURITY: Apply rate limiting to cancel operations
router.post('/:fileId/cancel', fileDeleteLimiter, async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const fileId = parseInt(req.params.fileId, 10);

    const file = await FileStorageModel.findById(fileId, userId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // SECURITY: Check if user has edit access to the work
    const workAccess = await WorkAccessService.checkAccess(userId, file.work_id);
    if (!workAccess.canEdit) {
      return res.status(403).json({
        error: 'Cannot cancel this file upload. Edit permission required on the work.'
      });
    }

    console.log(`[Cancel] User ${userId} cancelling file ${fileId} (status: ${file.upload_status})`);

    // 1. Delete tus upload metadata (.info file)
    if (file.storage_key) {
      try {
        // Remove tus upload - this deletes the .info file
        await tusServer.datastore.remove(file.storage_key);
        console.log(`[Cancel] Removed tus metadata: ${file.storage_key}`);
      } catch (err) {
        console.error('[Cancel] Error removing tus metadata:', err);
      }
    }

    // 2. Delete file from MinIO (partial or complete)
    try {
      await minioService.deleteFile(file.storage_key);
      console.log(`[Cancel] Deleted file from MinIO: ${file.storage_key}`);
    } catch (err) {
      // File might not exist yet if upload just started
      console.log(`[Cancel] No file to delete from MinIO (may not have started): ${err}`);
    }

    // 3. Delete from database
    await FileStorageModel.delete(fileId, userId);
    console.log(`[Cancel] Removed from database: ${fileId}`);

    res.status(204).send();
  } catch (error) {
    console.error('[Cancel] Error:', error);
    next(error);
  }
});

export default router;
