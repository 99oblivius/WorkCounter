import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess, requireResourceOwnership } from '../middleware/authorization.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkModel } from '../models/Work.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { minioService } from '../services/minioService.js';
import { sseService } from '../services/sseService.js';
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

// Get sessions for a work - requires view access to work
router.get('/work/:workId', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    // Check work access
    const access = await WorkAccessService.checkAccess(userId, workId);
    if (!access.canView) {
      return res.status(403).json({ error: 'Cannot view this work' });
    }

    // Get all sessions for this work (not just user's sessions)
    const sessions = await TimeSessionModel.findByWorkIdWithAccess(workId);
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

// Start a session - requires edit access to work
router.post('/start', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const { workId } = startSessionSchema.parse(req.body);

    // Check work access - need create permission to start timer (Editor+)
    const access = await WorkAccessService.checkAccess(userId, workId);
    if (!access.canCreate) {
      return res.status(403).json({ error: 'Cannot start timer for this work. Editor or Manager permission required.' });
    }

    const work = await WorkModel.findByIdWithAccess(workId);
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

    // Emit SSE event for real-time updates
    await sseService.emitWorkUpdate(workId, 'session:start', session);

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
});

// Stop a session - must own session OR have edit access to work
router.post('/:id/stop', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    const session = await TimeSessionModel.findByIdWithAccess(id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (!session.is_running) {
      return res.status(400).json({ error: 'Session is not running' });
    }

    // Check if user owns session OR is manager
    const ownsSession = session.user_id === userId;
    const workAccess = await WorkAccessService.checkAccess(userId, session.work_id);

    // Must have at least Editor permission (canCreate) if stopping own session
    // Or Manager permission (canEditOthers) if stopping someone else's session
    if (ownsSession) {
      if (!workAccess.canCreate) {
        return res.status(403).json({ error: 'Editor or Manager permission required to stop sessions' });
      }
    } else {
      if (!workAccess.canEditOthers) {
        return res.status(403).json({ error: 'Only Manager permission can stop others\' sessions' });
      }
    }

    const stoppedSession = await TimeSessionModel.stopWithAccess(id, new Date());

    // Emit SSE event for real-time updates
    await sseService.emitWorkUpdate(session.work_id, 'session:stop', stoppedSession);

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

    // SECURITY: First get the session to check work access
    const existingSession = await TimeSessionModel.findByIdWithAccess(id);
    if (!existingSession) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // SECURITY: Check if user can modify this session (ownership-aware)
    const canModify = await WorkAccessService.canModifyResource(
      userId,
      existingSession.work_id,
      existingSession.user_id,
      'edit'
    );

    if (!canModify) {
      return res.status(403).json({
        error: 'Cannot edit this session. You can only edit your own sessions unless you have Manager permission.'
      });
    }

    // Use WithoutUserFilter since we already verified work-level permissions
    const session = await TimeSessionModel.updateWithoutUserFilter(id, {
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime: data.endTime ? new Date(data.endTime) : undefined,
    });

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Emit SSE event for real-time updates
    await sseService.emitWorkUpdate(existingSession.work_id, 'session:update', session);

    res.json(session);
  } catch (error) {
    next(error);
  }
});

// Delete a session - requires edit permission on work
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const id = parseInt(req.params.id, 10);

    console.log(`Deleting session ${id} for user ${userId}`);

    // Get session data before deleting (need workId for SSE and permission check)
    const sessionToDelete = await TimeSessionModel.findByIdWithAccess(id);

    if (!sessionToDelete) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // SECURITY: Check if user can delete this session (ownership-aware)
    const canDelete = await WorkAccessService.canModifyResource(
      userId,
      sessionToDelete.work_id,
      sessionToDelete.user_id,
      'delete'
    );

    if (!canDelete) {
      return res.status(403).json({
        error: 'Cannot delete this session. You can only delete your own sessions unless you have Manager permission.'
      });
    }

    // Get all timeline entries for this session to clean up images
    const entries = await TimelineEntryModel.findBySessionIdWithAccess(id);
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
    // Use WithoutUserFilter since we already verified work-level permissions
    const deleted = await TimeSessionModel.deleteWithoutUserFilter(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Emit SSE event for real-time updates
    await sseService.emitWorkUpdate(sessionToDelete.work_id, 'session:delete', { id });

    console.log(`Session ${id} deleted successfully`);
    res.status(204).send();
  } catch (error) {
    console.error(`Error deleting session ${req.params.id}:`, error);
    next(error);
  }
});

// Get work stats - requires view access to work
router.get('/work/:workId/stats', async (req, res, next) => {
  try {
    const userId = req.session.user!.userId;
    const workId = parseInt(req.params.workId, 10);

    // Check work access
    const access = await WorkAccessService.checkAccess(userId, workId);
    if (!access.canView) {
      return res.status(403).json({ error: 'Cannot view this work' });
    }

    const totalDuration = await TimeSessionModel.getTotalDurationWithAccess(workId);
    res.json({ totalDuration });
  } catch (error) {
    next(error);
  }
});

export default router;
