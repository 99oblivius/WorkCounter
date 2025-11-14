import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess, type WorkAccessRequest } from '../middleware/authorization.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { validateBody, validateQuery } from '../middleware/validateRequest.js';
import {
  titleSchema,
  descriptionSchema,
  workStatusEnum,
  searchSchema,
  statusFilterSchema,
  cursorPaginationSchema
} from '../utils/commonSchemas.js';
import { WorkModel } from '../models/Work.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { minioService } from '../services/minioService.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { WorkAccessCache } from '../services/cache/workAccessCache.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { ResourceDeletionService } from '../services/resourceDeletionService.js';
import { withTransaction } from '../config/database.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendBadRequest,
  sendForbidden,
  sendNotFound
} from '../utils/apiResponse.js';
import '../types/index.js';

const router = Router();

// SECURITY: Comprehensive input validation with max lengths
const createWorkSchema = z.object({
  title: titleSchema,
  description: descriptionSchema,
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().max(999999.99).optional(),  // SECURITY FIX: Max value
  tags: z.array(z.string().max(100)).max(20).optional(),  // SECURITY FIX: Max tag length and count
  groupId: z.number().int().positive().nullable().optional(),
});

const updateWorkSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema,
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().max(999999.99).optional(),  // SECURITY FIX: Max value
  status: workStatusEnum.optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),  // SECURITY FIX: Max tag length and count
  groupId: z.number().int().positive().nullable().optional(),
});

// Query schema for list endpoint with pagination
const workListQuerySchema = searchSchema
  .merge(statusFilterSchema)
  .merge(cursorPaginationSchema);

router.use(requireAuth);

router.get('/', validateQuery(workListQuerySchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const { status, search, limit, cursor } = req.query as {
    status?: string;
    search?: string;
    limit?: number;
    cursor?: number;
  };

  const paginationOptions = {
    limit: limit || 20,
    cursor
  };

  let result;
  if (search) {
    result = await WorkModel.searchPaginated(userId, search, paginationOptions);
  } else {
    result = await WorkModel.findByUserIdPaginated(userId, {
      ...paginationOptions,
      status
    });
  }

  sendSuccess(res, result);
}));

router.get('/:id', parseNumericParams(['id']), requireWorkAccess('view'), asyncHandler(async (req, res) => {
  const id = req.params.id as unknown as number;

  const work = await WorkModel.findByIdWithAccess(id);

  if (!work) {
    return sendNotFound(res, 'Work not found');
  }

  sendSuccess(res, work);
}));

router.get('/:id/permissions', parseNumericParams(['id']), requireWorkAccess('view'), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const workId = req.params.id as unknown as number;

  const permissions = await WorkAccessService.checkAccess(userId, workId);

  sendSuccess(res, {
    permissionLevel: permissions.permissionLevel,
    canView: permissions.canView,
    canCreate: permissions.canCreate,
    canEditOthers: permissions.canEditOthers,
    canDeleteOthers: permissions.canDeleteOthers,
    canEdit: permissions.canEdit,
    canDelete: permissions.canDelete,
    isOwner: permissions.isOwner,
    isShared: permissions.isShared
  });
}));

router.post('/', validateBody(createWorkSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;

  const work = await WorkModel.create({
    userId,
    ...req.body,
  });

  await unifiedSseService.emitToUser(userId, 'work:create', work);

  sendCreated(res, work);
}));

router.patch('/:id', parseNumericParams(['id']), requireWorkAccess('edit'), validateBody(updateWorkSchema), asyncHandler(async (req: WorkAccessRequest, res) => {
  const userId = req.session.user!.userId;
  const id = req.params.id as unknown as number;

  const workAccess = req.workAccess!;

  if (!workAccess.isOwner) {
    return sendForbidden(res, 'Only the work owner can update work details');
  }

  const { title, description, clientName, hourlyRate, status, tags, groupId } = req.body;

  const updateData: any = {};
  if (title !== undefined) updateData.title = title;
  if (description !== undefined) updateData.description = description;
  if (clientName !== undefined) updateData.client_name = clientName;
  if (hourlyRate !== undefined) updateData.hourly_rate = hourlyRate;
  if (status !== undefined) updateData.status = status;
  if (tags !== undefined) updateData.tags = tags;
  if (groupId !== undefined) updateData.group_id = groupId;

  const work = await WorkModel.update(id, userId, updateData);

  if (!work) {
    return sendNotFound(res, 'Work not found');
  }

  WorkAccessCache.invalidateOnSharingChange(id);

  await unifiedSseService.emitToWork(id, 'work:update', work);

  await unifiedSseService.emitToUser(userId, 'work:update', work);

  sendSuccess(res, work);
}));

router.delete('/:id', parseNumericParams(['id']), requireWorkAccess('delete'), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  await ResourceDeletionService.deleteWork(id, userId);
  sendNoContent(res);
}));

export default router;
