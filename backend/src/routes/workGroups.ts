import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { validateBody } from '../middleware/validateRequest.js';
import { titleSchema } from '../utils/commonSchemas.js';
import { WorkGroupModel } from '../models/WorkGroup.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendConflict
} from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import '../types/index.js';

const router = Router();

// Input validation schemas
const createGroupSchema = z.object({
  title: titleSchema,
});

const updateGroupSchema = z.object({
  title: titleSchema.optional(),
  displayOrder: z.number().int().min(0).optional(),
});

const reorderSchema = z.object({
  groupOrders: z.array(
    z.object({
      id: z.number().int().positive(),
      displayOrder: z.number().int().min(0),
    })
  ),
});

router.use(requireAuth);

// Get all work groups for current user
router.get('/', asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const groups = await WorkGroupModel.findByUserId(userId);
  sendSuccess(res, groups);
}));

// Create a new work group
router.post('/', validateBody(createGroupSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;

  try {
    const group = await WorkGroupModel.create(userId, req.body.title);

    // Emit SSE event for real-time updates
    await unifiedSseService.emitToUser(userId, 'workgroup:create', group);

    sendCreated(res, group);
  } catch (error) {
    // Handle unique constraint violation (duplicate title)
    if ((error as any).code === '23505') {
      return sendConflict(res, 'A group with this title already exists');
    }
    throw error;
  }
}));

// Batch update display orders (for drag-and-drop) - MUST be before /:id routes
router.post('/reorder', validateBody(reorderSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;

  await WorkGroupModel.reorder(userId, req.body.groupOrders);

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToUser(userId, 'workgroup:reorder', { groupOrders: req.body.groupOrders });

  sendSuccess(res, { success: true });
}));

// Update a work group
router.patch('/:id', parseNumericParams(['id']), validateBody(updateGroupSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = req.params.id as unknown as number; // parseNumericParams already converted

  try {
    const group = await WorkGroupModel.update(id, userId, req.body);

    if (!group) {
      return sendNotFound(res, 'Work group not found');
    }

    // Emit SSE event for real-time updates
    await unifiedSseService.emitToUser(userId, 'workgroup:update', group);

    sendSuccess(res, group);
  } catch (error) {
    // Handle unique constraint violation (duplicate title)
    if ((error as any).code === '23505') {
      return sendConflict(res, 'A group with this title already exists');
    }
    throw error;
  }
}));

// Delete a work group (works become ungrouped)
router.delete('/:id', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  const deleted = await WorkGroupModel.delete(id, userId);

  if (!deleted) {
    return sendNotFound(res, 'Work group not found');
  }

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToUser(userId, 'workgroup:delete', { id });

  sendNoContent(res);
}));

export default router;
