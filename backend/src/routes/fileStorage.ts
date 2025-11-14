import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess } from '../middleware/authorization.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { minioService } from '../services/minioService.js';
import { tusServer } from '../services/tusService.js';
import { RoleService } from '../services/roleService.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { validateQuery } from '../middleware/validateRequest.js';
import { cursorPaginationSchema } from '../utils/commonSchemas.js';
import {
  sendSuccess,
  sendNoContent,
  sendNotFound,
  sendForbidden,
  sendUnauthorized,
  sendInternalError
} from '../utils/apiResponse.js';

const router = Router();

// SECURITY: Rate limiting for file upload creation (POST only)
// Global rate limit - prevents system-wide upload spam
const globalUploadCreateLimiter = rateLimit({
  windowMs: 30 * 1000, // 30 seconds
  max: 30, // 30 upload creations per 30 seconds globally
  message: { error: 'System is busy, please try again in a moment' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: () => 'global', // Same key for all users
});

// Per-user rate limit - prevents individual user spam
const userUploadCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 upload creations per 15 minutes per user
  message: { error: 'Too many file uploads, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    return req.session?.user?.userId ? `user:${req.session.user.userId}` : 'anonymous';
  },
});

const fileDownloadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 downloads per minute per user
  message: { error: 'Too many download requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use userId as key instead of IP address
  keyGenerator: (req: any) => {
    return req.session?.user?.userId ? `user:${req.session.user.userId}` : 'anonymous';
  },
});

const fileDeleteLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 deletions per 5 minutes per user
  message: { error: 'Too many delete requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  // Use userId as key instead of IP address
  keyGenerator: (req: any) => {
    return req.session?.user?.userId ? `user:${req.session.user.userId}` : 'anonymous';
  },
});

// Middleware to check auth and permissions for tus, and restore original res.end (session middleware wraps it)
const tusAuthCheck = async (req: any, res: any, next: any) => {
  if (!req.session?.user?.userId) {
    console.error('[tus route] Unauthorized upload attempt');
    return sendUnauthorized(res, 'Unauthorized');
  }

  // SECURITY: Check if user has files.upload permission
  try {
    const hasPermission = await RoleService.userHasPermission(
      req.session.user.userId,
      'files.upload'
    );

    if (!hasPermission) {
      console.error(`[tus route] User ${req.session.user.userId} lacks files.upload permission`);
      return sendForbidden(res, 'File upload not permitted. Contact administrator for access.');
    }
  } catch (error) {
    console.error('[tus route] Error checking permission:', error);
    return sendInternalError(res, 'Internal server error');
  }

  // CRITICAL: Restore the original res.end that was wrapped by express-session
  // This prevents session middleware from interfering with tus/srvx response handling
  if ((res as any)._originalEnd) {
    res.end = (res as any)._originalEnd;
  }

  next();
};

// tus upload endpoints - auth checked but session response wrapping removed
// SECURITY: Rate limit only on POST (upload creation), not PATCH (chunks) or HEAD (status)
// This prevents large files from hitting rate limits during chunk uploads

// POST /api/files/upload - Create new upload (rate limited)
router.post('/upload', tusAuthCheck, globalUploadCreateLimiter, userUploadCreateLimiter, (req, res) => {
  return tusServer.handle(req, res);
});

// PATCH /api/files/upload/:id - Upload chunk (no rate limit - TUS protocol protects)
router.patch('/upload/*', tusAuthCheck, (req, res) => {
  return tusServer.handle(req, res);
});

// HEAD /api/files/upload/:id - Check upload status (no rate limit)
router.head('/upload/*', tusAuthCheck, (req, res) => {
  return tusServer.handle(req, res);
});

// DELETE /api/files/upload/:id - Cancel upload (handled by frontend cancel endpoint)
router.delete('/upload/*', tusAuthCheck, (req, res) => {
  return tusServer.handle(req, res);
});

// All other routes require authentication
router.use(requireAuth);

// Get all files for a work (completed only) - requires view access to work (with pagination)
router.get('/work/:workId', parseNumericParams(['workId']), requireWorkAccess('view'), validateQuery(cursorPaginationSchema), asyncHandler(async (req, res) => {
  const workId = parseInt(req.params.workId, 10);
  const { limit, cursor } = req.query as { limit?: number; cursor?: number };

  // Return ALL files for this work, not just user's, with pagination
  const result = await FileStorageModel.findByWorkIdWithAccessPaginated(workId, {
    limit: limit || 20,
    cursor
  });
  sendSuccess(res, result);
}));

// Get all files for a work (including in-progress) - requires view access to work (with pagination)
router.get('/work/:workId/all', parseNumericParams(['workId']), requireWorkAccess('view'), validateQuery(cursorPaginationSchema), asyncHandler(async (req, res) => {
  const workId = parseInt(req.params.workId, 10);
  const { limit, cursor } = req.query as { limit?: number; cursor?: number };

  // Return ALL files for this work, not just user's, with pagination
  const result = await FileStorageModel.findAllByWorkIdWithAccessPaginated(workId, {
    limit: limit || 20,
    cursor
  });
  sendSuccess(res, result);
}));

// Get file metadata
router.get('/:fileId', parseNumericParams(['fileId']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const fileId = parseInt(req.params.fileId, 10);

  const file = await FileStorageModel.findById(fileId, userId);
  if (!file) {
    return sendNotFound(res, 'File not found');
  }

  sendSuccess(res, file);
}));

// Download file
// SECURITY: Apply rate limiting to downloads
router.get('/:fileId/download', parseNumericParams(['fileId']), fileDownloadLimiter, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const fileId = parseInt(req.params.fileId, 10);

  // Get file without user filtering to support shared works
  const file = await FileStorageModel.findByIdWithoutUserFilter(fileId);
  if (!file || file.upload_status !== 'completed') {
    return sendNotFound(res, 'File not found or not ready');
  }

  // SECURITY: Check if user has view access to the work
  const workAccess = await WorkAccessService.checkAccess(userId, file.work_id);
  if (!workAccess.canView) {
    return sendForbidden(res, 'Cannot download this file. View permission required on the work.');
  }

  // CRITICAL: Restore the original res.end that was wrapped by express-session
  // This prevents session middleware from interfering with streaming large files
  if ((res as any)._originalEnd) {
    res.end = (res as any)._originalEnd;
  }

  try {
    const { stream, contentType, contentLength } = await minioService.streamFile(file.storage_key);

    res.set({
      'Content-Type': file.mime_type || contentType || 'application/octet-stream',
      'Content-Length': (file.file_size || contentLength).toString(),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.display_name)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=0',
      'Accept-Ranges': 'bytes',
      'X-Accel-Buffering': 'no',
    });

    stream.on('error', (error) => {
      console.error(`[Download] Stream error for file ${fileId}:`, error);
      if (!res.headersSent) {
        return sendInternalError(res, 'Failed to download file');
      }
    });

    stream.pipe(res);
  } catch (error: any) {
    console.error(`[Download] Error for file ${fileId}:`, error);

    if (error.statusCode === 404) {
      console.error(`[Download] File ${fileId} exists in DB but not in storage, marking as failed`);
      await FileStorageModel.updateStatus(fileId, 'failed', 'File not found in storage');
      return sendNotFound(res, 'File not found in storage');
    }

    return sendInternalError(res, 'Failed to download file');
  }
}));

// Delete file
// SECURITY: Apply rate limiting to deletions
router.delete('/:fileId', parseNumericParams(['fileId']), fileDeleteLimiter, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const fileId = parseInt(req.params.fileId, 10);

  // Get file to delete (without user filtering to support shared works)
  const file = await FileStorageModel.findByIdWithoutUserFilter(fileId);
  if (!file) {
    return sendNotFound(res, 'File not found');
  }

  // SECURITY: Check if user can delete this file (ownership-aware)
  const canDelete = await WorkAccessService.canModifyResource(
    userId,
    file.work_id,
    file.user_id,
    'delete'
  );

  if (!canDelete) {
    return sendForbidden(res, 'Cannot delete this file. You can only delete your own files unless you have Manager permission.');
  }

  if (file) {
    try {
      await tusServer.datastore.remove(file.storage_key);
    } catch (err) {
      // Ignore - metadata may not exist
    }

    if (file.upload_status === 'completed') {
      await minioService.deleteFile(file.storage_key);
    }

    await FileStorageModel.deleteWithoutUserFilter(fileId);

    await unifiedSseService.emitToWork(file.work_id, 'file:delete', { id: fileId, workId: file.work_id });
  }

  sendNoContent(res);
}));

router.post('/:fileId/cancel', parseNumericParams(['fileId']), fileDeleteLimiter, asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const fileId = parseInt(req.params.fileId, 10);

  const file = await FileStorageModel.findByIdWithoutUserFilter(fileId);
  if (!file) {
    return sendNotFound(res, 'File not found');
  }

  // SECURITY: Check if user can delete this file (ownership-aware)
  const canDelete = await WorkAccessService.canModifyResource(
    userId,
    file.work_id,
    file.user_id,
    'delete'
  );

  if (!canDelete) {
    return sendForbidden(res, 'Cannot cancel this file upload. You can only cancel your own files unless you have Manager permission.');
  }

  if (file.storage_key) {
    try {
      await tusServer.datastore.remove(file.storage_key);
    } catch (err) {
      console.error('[Cancel] Error removing tus metadata:', err);
    }
  }

  try {
    await minioService.deleteFile(file.storage_key);
  } catch (err) {
    // Ignore - file might not exist yet
  }

  await FileStorageModel.deleteWithoutUserFilter(fileId);

  await unifiedSseService.emitToWork(file.work_id, 'file:delete', { id: fileId, workId: file.work_id });

  sendNoContent(res);
}));

export default router;
