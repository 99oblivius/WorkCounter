import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess, requireResourceOwnership } from '../middleware/authorization.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { validateBody, validateQuery } from '../middleware/validateRequest.js';
import { colorEnum, titleSchema, cursorPaginationSchema } from '../utils/commonSchemas.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkModel } from '../models/Work.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { minioService } from '../services/minioService.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { ResourceDeletionService } from '../services/resourceDeletionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import {
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendConflict
} from '../utils/apiResponse.js';
import '../types/index.js';

const router = Router();

// Simple in-memory cache for running sessions (5 second TTL)
interface CachedSessions {
  data: any[];
  timestamp: number;
}
const runningSessionsCache = new Map<number, CachedSessions>();
const CACHE_TTL = 5000; // 5 seconds

const startSessionSchema = z.object({
  workId: z.number().int().positive(),
});

const updateSessionSchema = z.object({
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  title: titleSchema.nullable().optional(),
  color: colorEnum.nullable().optional(),
});

router.use(requireAuth);

router.get('/running', asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const session = await TimeSessionModel.findRunningSession(userId);
  sendSuccess(res, session);
}));

// FIX BUG 3: Get all running sessions across all accessible works
// This allows the dashboard to show running timers from shared works
// PERFORMANCE: Cached for 5 seconds to reduce DB load from dashboard polling
router.get('/running/all', asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;

  // Check cache first
  const cached = runningSessionsCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return sendSuccess(res, cached.data);
  }

  // Query all running sessions where user has access to the work
  // Include username for session ownership display
  const result = await query<import('../types/index.js').TimeSession>(
    `SELECT DISTINCT ts.*, u.username
     FROM time_sessions ts
     INNER JOIN work_access wa ON ts.work_id = wa.work_id
     INNER JOIN users u ON ts.user_id = u.id
     WHERE ts.is_running = true
       AND wa.user_id = $1
       AND wa.can_view = true
     ORDER BY ts.start_time DESC`,
    [userId]
  );

  // Update cache
  runningSessionsCache.set(userId, {
    data: result.rows,
    timestamp: Date.now()
  });

  sendSuccess(res, result.rows);
}));

// Get sessions for a work - requires view access to work (with pagination)
router.get('/work/:workId', parseNumericParams(['workId']), requireWorkAccess('view'), validateQuery(cursorPaginationSchema), asyncHandler(async (req, res) => {
  const workId = parseInt(req.params.workId, 10);
  const { limit, cursor } = req.query as { limit?: number; cursor?: number };

  // Get all sessions for this work (not just user's sessions) with pagination
  const result = await TimeSessionModel.findByWorkIdWithAccessPaginated(workId, {
    limit: limit || 20,
    cursor
  });
  sendSuccess(res, result);
}));

router.get('/:id', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  const session = await TimeSessionModel.findById(id, userId);

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  sendSuccess(res, session);
}));

// Start a session - requires edit access to work
router.post('/start', validateBody(startSessionSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const { workId } = req.body;

  // Check work access - need create permission to start timer (Editor+)
  const access = await WorkAccessService.checkAccess(userId, workId);
  if (!access.canCreate) {
    return sendForbidden(res, 'Cannot start timer for this work. Editor or Manager permission required.');
  }

  const work = await WorkModel.findByIdWithAccess(workId);
  if (!work) {
    return sendNotFound(res, 'Work not found');
  }

  const existingRunning = await TimeSessionModel.findRunningSession(userId);
  if (existingRunning) {
    return sendConflict(res, 'A session is already running. Please stop it first.');
  }

  const session = await TimeSessionModel.create({
    workId,
    userId,
    startTime: new Date(),
  });

  // Emit SSE event to work channel (for users viewing this specific work)
  await unifiedSseService.emitToWork(workId, 'session:start', session);

  // ALSO emit to all users' personal channels (for dashboard updates)
  // This is efficient: same session data sent to multiple users, no N+1 queries
  // NOTE: Users viewing the work will receive this event twice (work + user channel)
  // This is acceptable: setQueryData is idempotent, and it ensures dashboard updates
  const usersWithAccess = await WorkAccessService.getUsersWithAccess(workId);
  for (const userWithAccess of usersWithAccess) {
    // Invalidate cache for all users with work access
    runningSessionsCache.delete(userWithAccess);
    // Emit same session data to each user's channel (dashboard will receive it)
    await unifiedSseService.emitToUser(userWithAccess, 'session:start', session);
  }

  sendCreated(res, session);
}));

// Stop a session - must own session OR have edit access to work
router.post('/:id/stop', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  const session = await TimeSessionModel.findByIdWithAccess(id);
  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  if (!session.is_running) {
    return sendBadRequest(res, 'Session is not running');
  }

  // Check if user owns session OR is manager
  const ownsSession = session.user_id === userId;
  const workAccess = await WorkAccessService.checkAccess(userId, session.work_id);

  // Must have at least Editor permission (canCreate) if stopping own session
  // Or Manager permission (canEditOthers) if stopping someone else's session
  if (ownsSession) {
    if (!workAccess.canCreate) {
      return sendForbidden(res, 'Editor or Manager permission required to stop sessions');
    }
  } else {
    if (!workAccess.canEditOthers) {
      return sendForbidden(res, 'Only Manager permission can stop others\' sessions');
    }
  }

  const stoppedSession = await TimeSessionModel.stopWithAccess(id, new Date());

  // Emit SSE event to work channel (for users viewing this specific work)
  await unifiedSseService.emitToWork(session.work_id, 'session:stop', stoppedSession);

  // ALSO emit to all users' personal channels (for dashboard updates)
  // This is efficient: same session data sent to multiple users, no N+1 queries
  // NOTE: Users viewing the work will receive this event twice (work + user channel)
  // This is acceptable: setQueryData is idempotent, and it ensures dashboard updates
  const usersWithAccess = await WorkAccessService.getUsersWithAccess(session.work_id);
  for (const userWithAccess of usersWithAccess) {
    // Invalidate cache for all users with work access
    runningSessionsCache.delete(userWithAccess);
    // Emit same session data to each user's channel (dashboard will receive it)
    await unifiedSseService.emitToUser(userWithAccess, 'session:stop', stoppedSession);
  }

  sendSuccess(res, stoppedSession);
}));

router.patch('/:id', parseNumericParams(['id']), validateBody(updateSessionSchema), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = req.params.id as unknown as number; // parseNumericParams already converted

  // SECURITY: First get the session to check work access
  const existingSession = await TimeSessionModel.findByIdWithAccess(id);
  if (!existingSession) {
    return sendNotFound(res, 'Session not found');
  }

  // SECURITY: Check if user can modify this session (ownership-aware)
  const canModify = await WorkAccessService.canModifyResource(
    userId,
    existingSession.work_id,
    existingSession.user_id,
    'edit'
  );

  if (!canModify) {
    return sendForbidden(res, 'Cannot edit this session. You can only edit your own sessions unless you have Manager permission.');
  }

  const { startTime, endTime, title, color } = req.body;

  // Use WithoutUserFilter since we already verified work-level permissions
  const session = await TimeSessionModel.updateWithoutUserFilter(id, {
    startTime: startTime ? new Date(startTime) : undefined,
    endTime: endTime ? new Date(endTime) : undefined,
    title: title !== undefined ? title : undefined,
    color: color !== undefined ? color : undefined,
  });

  if (!session) {
    return sendNotFound(res, 'Session not found');
  }

  // Emit SSE event for real-time updates
  await unifiedSseService.emitToWork(existingSession.work_id, 'session:update', session);

  // ALSO emit to all users' personal channels (for dashboard updates)
  // This ensures dashboard shows updated session title/color for running sessions
  // NOTE: Users viewing the work will receive this event twice (work + user channel)
  // This is acceptable: setQueryData is idempotent, and it ensures dashboard updates
  const usersWithAccess = await WorkAccessService.getUsersWithAccess(existingSession.work_id);
  for (const userWithAccess of usersWithAccess) {
    // Invalidate cache for all users with work access
    runningSessionsCache.delete(userWithAccess);
    // Emit same session data to each user's channel (dashboard will receive it)
    await unifiedSseService.emitToUser(userWithAccess, 'session:update', session);
  }

  sendSuccess(res, session);
}));

// Delete a session - requires edit permission on work
router.delete('/:id', parseNumericParams(['id']), asyncHandler(async (req, res) => {
  const userId = req.session.user!.userId;
  const id = parseInt(req.params.id, 10);

  // Get session data before deleting (need workId for SSE and permission check)
  const sessionToDelete = await TimeSessionModel.findByIdWithAccess(id);

  if (!sessionToDelete) {
    return sendNotFound(res, 'Session not found');
  }

  // SECURITY: Check if user can delete this session (ownership-aware)
  const canDelete = await WorkAccessService.canModifyResource(
    userId,
    sessionToDelete.work_id,
    sessionToDelete.user_id,
    'delete'
  );

  if (!canDelete) {
    return sendForbidden(res, 'Cannot delete this session. You can only delete your own sessions unless you have Manager permission.');
  }

  // Store workId for async cleanup
  const workId = sessionToDelete.work_id;

  // Delete the session (cascade will delete timeline entries)
  // Use WithoutUserFilter since we already verified work-level permissions
  const deleted = await TimeSessionModel.deleteWithoutUserFilter(id);

  if (!deleted) {
    return sendNotFound(res, 'Session not found');
  }

  // Emit SSE event immediately for instant UI update
  await unifiedSseService.emitToWork(workId, 'session:delete', { id, workId });

  // Send response immediately - don't make client wait for cleanup
  sendNoContent(res);

  // Cleanup MinIO files asynchronously in background (fire and forget)
  // This doesn't block the HTTP response
  ResourceDeletionService.collectTimelineImages(id)
    .then(imageKeys => {
      if (imageKeys.length > 0) {
        return minioService.deleteFiles(imageKeys);
      }
    })
    .catch(error => {
      // Log but don't fail - database deletion already succeeded
      console.error(`[Session Delete] Failed to cleanup MinIO files for session ${id}:`, error);
    });
}));

// Get work stats - requires view access to work
router.get('/work/:workId/stats', parseNumericParams(['workId']), requireWorkAccess('view'), asyncHandler(async (req, res) => {
  const workId = parseInt(req.params.workId, 10);

  const totalDuration = await TimeSessionModel.getTotalDurationWithAccess(workId);
  sendSuccess(res, { totalDuration });
}));

export default router;
