import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { WorkGroupModel } from '../models/WorkGroup.js';
import '../types/index.js';

const router = Router();

// Input validation schemas
const createGroupSchema = z.object({
  title: z.string().min(1).max(255),
});

const updateGroupSchema = z.object({
  title: z.string().min(1).max(255).optional(),
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
router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const groups = await WorkGroupModel.findByUserId(userId);
    res.json(groups);
  } catch (error) {
    next(error);
  }
});

// Create a new work group
router.post('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = createGroupSchema.parse(req.body);

    const group = await WorkGroupModel.create(userId, data.title);
    res.status(201).json(group);
  } catch (error) {
    // Handle unique constraint violation (duplicate title)
    if ((error as any).code === '23505') {
      return res.status(409).json({ error: 'A group with this title already exists' });
    }
    next(error);
  }
});

// Batch update display orders (for drag-and-drop) - MUST be before /:id routes
router.post('/reorder', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = reorderSchema.parse(req.body);

    await WorkGroupModel.reorder(userId, data.groupOrders);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Update a work group
router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateGroupSchema.parse(req.body);

    const group = await WorkGroupModel.update(id, userId, data);

    if (!group) {
      return res.status(404).json({ error: 'Work group not found' });
    }

    res.json(group);
  } catch (error) {
    // Handle unique constraint violation (duplicate title)
    if ((error as any).code === '23505') {
      return res.status(409).json({ error: 'A group with this title already exists' });
    }
    next(error);
  }
});

// Delete a work group (works become ungrouped)
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const deleted = await WorkGroupModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Work group not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
