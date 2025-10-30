import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import '../types/index.js';

const router = Router();

const createEntrySchema = z.object({
  timeSessionId: z.number().int().positive(),
  workId: z.number().int().positive(),
  timestamp: z.string().datetime(),
  label: z.string().min(1),
  activityType: z.string().optional(),
});

const updateEntrySchema = z.object({
  timestamp: z.string().datetime().optional(),
  label: z.string().min(1).optional(),
  activityType: z.string().optional(),
});

router.use(requireAuth);

router.get('/session/:sessionId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const sessionId = parseInt(req.params.sessionId, 10);

    const entries = await TimelineEntryModel.findBySessionId(sessionId, userId);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    const entries = await TimelineEntryModel.findByWorkId(workId, userId);
    res.json(entries);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const entry = await TimelineEntryModel.findById(id, userId);

    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const data = createEntrySchema.parse(req.body);

    const session = await TimeSessionModel.findById(data.timeSessionId, userId);
    if (!session) {
      return res.status(404).json({ error: 'Time session not found' });
    }

    const entry = await TimelineEntryModel.create({
      timeSessionId: data.timeSessionId,
      workId: data.workId,
      userId,
      timestamp: new Date(data.timestamp),
      label: data.label,
      activityType: data.activityType,
    });

    res.status(201).json(entry);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateEntrySchema.parse(req.body);

    const entry = await TimelineEntryModel.update(id, userId, {
      timestamp: data.timestamp ? new Date(data.timestamp) : undefined,
      label: data.label,
      activity_type: data.activityType,
    });

    if (!entry) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.json(entry);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const deleted = await TimelineEntryModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Timeline entry not found' });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
