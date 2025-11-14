import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { checkAttachmentUploadPermission, requireWorkAccess } from '../middleware/authorization.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { requireOwnership, type RequestWithResource } from '../middleware/requireOwnership.js';
import { validateBody, validateQuery } from '../middleware/validateRequest.js';
import { uploadImages } from '../middleware/upload.js';
import { cursorPaginationSchema } from '../utils/commonSchemas.js';
import { query, withTransaction } from '../config/database.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { ResourceDeletionService } from '../services/resourceDeletionService.js';
import { imageProcessor } from '../services/imageProcessor.js';
import { minioService } from '../services/minioService.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendInternalError
} from '../utils/apiResponse.js';
import '../types/index.js';

const router = Router();

// Valid activity types for timeline entries
const validActivityTypes = ['meeting', 'coding', 'review', 'testing', 'documentation', 'planning', 'break', 'research'] as const;

// SECURITY: Comprehensive input validation with max lengths
const createEntrySchema = z.object({
  timeSessionId: z.number().int().positive(),
  workId: z.number().int().positive(),
  timestamp: z.string().datetime(),
  label: z.string().min(1).max(2000).optional(), // SECURITY FIX: Added max length
  activityType: z.enum(validActivityTypes).optional(),
});

const updateEntrySchema = z.object({
  timestamp: z.string().datetime().optional(),
  label: z.string().min(1).max(2000).nullable().optional(),  // SECURITY FIX: Added max length
  activityType: z.enum(validActivityTypes).nullable().optional(),
});

router.use(requireAuth);

router.get('/session/:sessionId', parseNumericParams(['sessionId']), validateQuery(cursorPaginationSchema), asyncHandler(async (req, res) => {
  const sessionId = parseInt(req.params.sessionId, 10);
  const { limit, cursor } = req.query as { limit?: number; cursor?: number };

  // Get all entries for this session (authorization handled at session/work level) with pagination
  const result = await TimelineEntryModel.findBySessionIdWithAccessPaginated(sessionId, {
    limit: limit || 20,
    cursor
  });
  sendSuccess(res, result);
}));

// Get all timeline entries for a work (requires view access to work) with pagination
router.get('/work/:workId', parseNumericParams(['workId']), requireWorkAccess('view'), validateQuery(cursorPaginationSchema), asyncHandler(async (req, res) => {
  const workId = parseInt(req.params.workId, 10);
  const { limit, cursor } = req.query as { limit?: number; cursor?: number };

  // Return ALL timeline entries for this work, not just user's, with pagination
  const result = await TimelineEntryModel.findByWorkIdWithAccessPaginated(workId, {
    limit: limit || 20,
    cursor
  });
  sendSuccess(res, result);
}));

router.get('/:id', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  const entry = await TimelineEntryModel.findById(id, userId);

  if (!entry) {
    return sendNotFound(res, 'Timeline entry not found');
  }

  sendSuccess(res, entry);
}));

router.post('/', validateBody(createEntrySchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const data = req.body;

  // SECURITY: Check if user has create access to the work (Editor+)
  const workAccess = await WorkAccessService.checkAccess(userId, data.workId);
  if (!workAccess.canCreate) {
    return sendForbidden(res, 'Cannot create timeline entry. Editor or Manager permission required.');
  }

  // FIX BUG 1: Managers should be able to add notes to any session in the work, not just their own
  // Use WithAccess method since we already verified work-level create permission
  const session = await TimeSessionModel.findByIdWithAccess(data.timeSessionId);
  if (!session) {
    return sendNotFound(res, 'Time session not found');
  }

  // Verify session belongs to the same work
  if (session.work_id !== data.workId) {
    return sendBadRequest(res, 'Session does not belong to this work');
  }

  const entry = await TimelineEntryModel.create({
    timeSessionId: data.timeSessionId,
    workId: data.workId,
    userId,
    timestamp: new Date(data.timestamp),
    label: data.label,
    activityType: data.activityType,
  });

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToWork(data.workId, 'timeline:create', entry);

  sendCreated(res, entry);
}));

router.patch('/:id', parseNumericParams(['id']), requireOwnership('timeline entry', TimelineEntryModel.findByIdWithAccess, 'edit'), validateBody(updateEntrySchema), asyncHandler(async (req: RequestWithResource, res) => {
  const id = parseInt(req.params.id, 10);
  const data = req.body;
  const existingEntry = req.resourceData!; // Already fetched and validated by middleware

  // Use WithoutUserFilter since requireOwnership middleware already verified work-level permissions
  const entry = await TimelineEntryModel.updateWithoutUserFilter(id, {
    timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
    label: data.label === null ? undefined : data.label,
    activity_type: data.activityType,
  });

  if (!entry) {
    return sendNotFound(res, 'Timeline entry not found');
  }

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToWork(existingEntry.work_id, 'timeline:update', entry);

  sendSuccess(res, entry);
}));

router.delete('/:id', parseNumericParams(['id']), requireOwnership('timeline entry', TimelineEntryModel.findByIdWithAccess, 'delete'), asyncHandler(async (req: RequestWithResource, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const entry = req.resourceData!; // Already fetched and permission-checked by middleware

  // Use ResourceDeletionService for consistent deletion with MinIO cleanup and SSE
  await ResourceDeletionService.deleteTimelineEntry(id, entry.work_id, userId);

  sendNoContent(res);
}));

// Upload images to an existing timeline entry
// SECURITY: Requires attachment upload permission
router.post('/:id/images', parseNumericParams(['id']), checkAttachmentUploadPermission, requireOwnership('timeline entry', TimelineEntryModel.findByIdWithAccess, 'edit'), uploadImages, asyncHandler(async (req: RequestWithResource, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params.id, 10);
  const entry = req.resourceData!; // Already fetched and permission-checked by middleware

  // Check if files were uploaded
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return sendBadRequest(res, 'No images provided');
  }

  // Check total images count (existing + new)
  const existingCount = entry.image_urls?.length || 0;
  if (existingCount + files.length > 9) {
    return sendBadRequest(res, `Maximum 9 images allowed. You already have ${existingCount} image(s).`);
  }

  // Process and upload images in bulk
  const imageUrls: string[] = [];

  for (const file of files) {
    // Validate image
    const isValid = await imageProcessor.validateImage(file.buffer);
    if (!isValid) {
      return sendBadRequest(res, `Invalid image file: ${file.originalname}`);
    }

    // Process image (convert to WebP, resize if needed)
    const processedBuffer = await imageProcessor.processImage(file.buffer);

    // Generate unique filename
    const filename = `${uuidv4()}.webp`;
    const imageKey = minioService.generateImageKey(userId, id, filename);

    // Upload to MinIO
    await minioService.uploadFile(imageKey, processedBuffer, 'image/webp');

    imageUrls.push(imageKey);
  }

  // Update entry with new image URLs
  // Use WithoutUserFilter since we already verified work-level permissions
  const updatedImageUrls = [...(entry.image_urls || []), ...imageUrls];
  const updatedEntry = await TimelineEntryModel.updateWithoutUserFilter(id, {
    image_urls: updatedImageUrls,
  });

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToWork(entry.work_id, 'timeline:update', updatedEntry);

  sendSuccess(res, updatedEntry);
}));

// Delete a specific image from a timeline entry
router.delete('/:id/images/:imageKey(*)', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);
  const imageKey = req.params.imageKey;

  // Check if entry exists (no user filter - we check permissions below)
  const entry = await TimelineEntryModel.findByIdWithAccess(id);
  if (!entry) {
    return sendNotFound(res, 'Timeline entry not found');
  }

  // SECURITY: Check if user can modify this timeline entry (ownership-aware)
  const canModify = await WorkAccessService.canModifyResource(
    userId,
    entry.work_id,
    entry.user_id,
    'edit'
  );

  if (!canModify) {
    return sendForbidden(res, 'Cannot delete images from this timeline entry. You can only modify your own entries unless you have Manager permission.');
  }

  // Check if image exists in entry
  if (!entry.image_urls || !entry.image_urls.includes(imageKey)) {
    return sendNotFound(res, 'Image not found in this entry');
  }

  // Delete image from MinIO
  await minioService.deleteFile(imageKey);

  // Update entry to remove image URL
  // Use WithoutUserFilter since we already verified work-level permissions
  const updatedImageUrls = entry.image_urls.filter(url => url !== imageKey);
  const updatedEntry = await TimelineEntryModel.updateWithoutUserFilter(id, {
    image_urls: updatedImageUrls.length > 0 ? updatedImageUrls : null,
  });

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToWork(entry.work_id, 'timeline:update', updatedEntry);

  sendSuccess(res, updatedEntry);
}));

// Serve an image from MinIO
router.get('/images/:imageKey(*)', requireAuth, asyncHandler(async (req, res) => {
  const imageKey = req.params.imageKey;
  const requestUserId = req.session.user!.userId;

  // Extract entryId from image key (format: userId/entryId/filename.webp)
  const parts = imageKey.split('/');
  if (parts.length < 3) {
    return sendBadRequest(res, 'Invalid image key');
  }

  const entryId = parseInt(parts[1], 10);

  // Check if user has access to the timeline entry's work
  // First get the entry to find its work_id
  const entryResult = await query<{ work_id: number }>(
    'SELECT work_id FROM timeline_entries WHERE id = $1',
    [entryId]
  );

  if (entryResult.rows.length === 0) {
    return sendNotFound(res, 'Timeline entry not found');
  }

  const workId = entryResult.rows[0].work_id;

  // Check if user has access to this work
  const access = await WorkAccessService.checkAccess(requestUserId, workId);
  if (!access.canView) {
    return sendForbidden(res, 'Access denied to work');
  }

  // Get image from MinIO
  const { buffer, contentType } = await minioService.getFile(imageKey);

  // Set cache headers for better performance
  res.set({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000', // 1 year
  });

  res.send(buffer);
}));

export default router;
