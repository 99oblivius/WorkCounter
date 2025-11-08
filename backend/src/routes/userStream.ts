import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { sseService } from '../services/sseService.js';
import { WorkModel } from '../models/Work.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { WorkAccessService } from '../services/workAccessService.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

/**
 * SSE endpoint for user-level real-time updates
 *
 * GET /api/user/stream
 *
 * Returns:
 * - Initial snapshot with all works user has access to
 * - Real-time updates when works are shared/unshared
 * - Real-time updates for running sessions across all accessible works
 *
 * Security:
 * - Requires authentication
 * - Only shows works user owns or has been granted access to
 *
 * Benefits:
 * - Replaces polling for owned/shared works lists
 * - Instant updates when works are shared/unshared
 * - Real-time "Active" indicators across all works
 * - Single SSE connection for entire dashboard
 */
router.get(
  '/stream',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;

      console.log(`[User Stream] User ${userId} connecting`);

      // Fetch all data in parallel for initial snapshot
      const [ownedWorks, sharedWorks, allRunningSessions] = await Promise.all([
        // Works owned by user
        WorkModel.findByUserId(userId),

        // Works shared with user
        WorkAccessService.getSharedWithUser(userId),

        // All running sessions across accessible works
        TimeSessionModel.findAllRunningForUser(userId),
      ]);

      // Prepare initial snapshot
      const snapshot = {
        ownedWorks,
        sharedWorks,
        runningSessions: allRunningSessions,
        timestamp: new Date().toISOString(),
      };

      // Setup SSE connection for user
      await sseService.setupUserConnection(userId, res, snapshot);

      // Connection will stay open until client disconnects
      // Updates sent via sseService.emitUserUpdate() from route handlers

    } catch (error) {
      console.error('[User Stream] Error setting up connection:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to establish stream' });
      }
    }
  }
);

export default router;
