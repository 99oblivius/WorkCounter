import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { WorkModel } from '../models/Work.js';
import '../types/index.js';

const router = Router();

const createWorkSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().optional(),
  tags: z.array(z.string()).optional(),
});

const updateWorkSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  clientName: z.string().max(255).optional(),
  hourlyRate: z.number().positive().optional(),
  status: z.enum(['active', 'archived', 'completed']).optional(),
  tags: z.array(z.string()).optional(),
});

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const { status, search } = req.query;

    let works;
    if (search && typeof search === 'string') {
      works = await WorkModel.search(userId, search);
    } else {
      works = await WorkModel.findByUserId(userId, status as string | undefined);
    }

    res.json(works);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const work = await WorkModel.findById(id, userId);

    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    res.json(work);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = createWorkSchema.parse(req.body);

    const work = await WorkModel.create({
      userId,
      ...data,
    });

    res.status(201).json(work);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateWorkSchema.parse(req.body);

    // Convert camelCase to snake_case for database
    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.clientName !== undefined) updateData.client_name = data.clientName;
    if (data.hourlyRate !== undefined) updateData.hourly_rate = data.hourlyRate;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.tags !== undefined) updateData.tags = data.tags;

    const work = await WorkModel.update(id, userId, updateData);

    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    res.json(work);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const deleted = await WorkModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Work not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
