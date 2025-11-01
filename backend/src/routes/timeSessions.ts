import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkModel } from '../models/Work.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { minioService } from '../services/minioService.js';
import '../types/index.js';

const router = Router();

const startSessionSchema = z.object({
  workId: z.number().int().positive(),
});

const updateSessionSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

router.use(requireAuth);

router.get('/running', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const session = await TimeSessionModel.findRunningSession(userId);
    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    const sessions = await TimeSessionModel.findByWorkId(workId, userId);
    res.json(sessions);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const session = await TimeSessionModel.findById(id, userId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/start', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const { workId } = startSessionSchema.parse(req.body);

    const work = await WorkModel.findById(workId, userId);
    if (!work) {
      return res.status(404).json({ error: 'Work not found' });
    }

    const existingRunning = await TimeSessionModel.findRunningSession(userId);
    if (existingRunning) {
      return res.status(400).json({ error: 'A session is already running. Please stop it first.' });
    }

    const session = await TimeSessionModel.create({
      workId,
      userId,
      startTime: new Date(),
    });

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

router.post('/:id/stop', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const session = await TimeSessionModel.findById(id, userId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.is_running) {
      return res.status(400).json({ error: 'Session is not running' });
    }

    const stoppedSession = await TimeSessionModel.stop(id, userId, new Date());
    res.json(stoppedSession);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);
    const data = updateSessionSchema.parse(req.body);

    const session = await TimeSessionModel.update(id, userId, {
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json(session);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    console.log(`Deleting session ${id} for user ${userId}`);

    // Get all timeline entries for this session to clean up images
    const entries = await TimelineEntryModel.findBySessionId(id, userId);
    console.log(`Found ${entries.length} timeline entries for session ${id}`);

    // Collect all image keys from all entries
    const imageKeys: string[] = [];
    entries.forEach(entry => {
      if (entry.image_urls && entry.image_urls.length > 0) {
        console.log(`Entry ${entry.id} has ${entry.image_urls.length} images:`, entry.image_urls);
        imageKeys.push(...entry.image_urls);
      }
    });

    console.log(`Total images to delete: ${imageKeys.length}`);

    // Delete all images from MinIO
    if (imageKeys.length > 0) {
      console.log(`Starting deletion of ${imageKeys.length} images from MinIO...`);
      await minioService.deleteFiles(imageKeys);
      console.log(`Cleaned up ${imageKeys.length} image(s) from deleted session ${id}`);
    } else {
      console.log(`No images to clean up for session ${id}`);
    }

    // Delete the session (cascade will delete timeline entries)
    const deleted = await TimeSessionModel.delete(id, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }

    console.log(`Session ${id} deleted successfully`);
    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting session ${req.params.id}:`, error);
    next(error);
  }
});

router.get('/work/:workId/stats', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    const totalDuration = await TimeSessionModel.getTotalDuration(workId, userId);
    res.json({ totalDuration });
  } catch (error) {
    next(error);
  }
});

export default router;
