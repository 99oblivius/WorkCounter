import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess } from '../middleware/authorization.js';
import { sseService } from '../services/sseService.js';
import { WorkModel } from '../models/Work.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { WorkAccessService } from '../services/workAccessService.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

/**
 * SSE endpoint for real-time work updates
 *
 * GET /api/works/:workId/stream
 *
 * Returns:
 * - Initial snapshot with all work data (work, sessions, timeline, files, stats, shares)
 * - Real-time updates via SSE events
 *
 * Security:
 * - Requires authentication
 * - Requires work access (view permission minimum)
 * - Supports multiple connections per user (multiple tabs/windows)
 *
 * Benefits:
 * - Replaces 5+ HTTP requests with 1 connection
 * - Replaces 3s polling with instant updates
 * - Reduces server load and latency
 * - Better browser connection management
 * - Real-time sync across all user's tabs/windows
 */
router.get(
  '/:workId/stream',
  requireAuth,
  requireWorkAccess('view'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workId = parseInt(req.params.workId, 10);
      const userId = req.user!.userId;

      console.log(`[Work Stream] User ${userId} connecting to work ${workId}`);

      // Fetch all data in parallel for initial snapshot
      const [
        work,
        sessions,
        timelineEntries,
        files,
        totalDuration,
        permissions,
        shares,
      ] = await Promise.all([
        // Work metadata (use WithAccess since we already checked permissions)
        WorkModel.findByIdWithAccess(workId),

        // Sessions (use WithAccess since we already checked permissions)
        TimeSessionModel.findByWorkIdWithAccess(workId),

        // Timeline entries (use WithAccess since we already checked permissions)
        TimelineEntryModel.findByWorkIdWithAccess(workId),

        // Files (use WithAccess since we already checked permissions)
        FileStorageModel.findByWorkIdWithAccess(workId),

        // Stats
        TimeSessionModel.getTotalDurationWithAccess(workId),

        // User's permissions on this work
        WorkAccessService.checkAccess(userId, workId),

        // Share list (only if owner)
        (async () => {
          const access = await WorkAccessService.checkAccess(userId, workId);
          if (access.isOwner) {
            return await WorkAccessService.getWorkShares(workId, userId);
          }
          return null;
        })(),
      ]);

      if (!work) {
        return res.status(404).json({ error: 'Work not found' });
      }

      // Prepare initial snapshot
      const snapshot = {
        work,
        sessions,
        timeline: timelineEntries,
        files,
        stats: { totalDuration },
        permissions,
        shares,
        timestamp: new Date().toISOString(),
      };

      // Setup SSE connection
      await sseService.setupConnection(workId, userId, res, snapshot);

      // Connection will stay open until client disconnects
      // Updates sent via sseService.emitWorkUpdate() from route handlers

    } catch (error) {
      console.error('[Work Stream] Error setting up connection:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish stream' });
      }
    }
  }
);

export default router;
