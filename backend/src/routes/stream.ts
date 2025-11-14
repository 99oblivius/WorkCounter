import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess } from '../middleware/authorization.js';
import { validateBody } from '../middleware/validateRequest.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { WorkModel } from '../models/Work.js';
import { TimeSessionModel } from '../models/TimeSession.js';
import { TimelineEntryModel } from '../models/TimelineEntry.js';
import { FileStorageModel } from '../models/FileStorage.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { PermissionService } from '../services/permissionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendBadRequest, sendNotFound, sendInternalError } from '../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

/**
 * Unified SSE Stream Endpoint
 *
 * GET /api/stream
 *
 * Single SSE connection for all real-time updates:
 * - User-level events (dashboard): works, permissions, account status
 * - Work-level events (work page): sessions, timeline, files, shares
 *
 * Initial snapshot includes:
 * - User permissions and limits
 * - Owned works
 * - Shared works
 * - Running sessions across all accessible works
 *
 * Context switching via PUT /api/stream/context changes subscriptions dynamically
 *
 * Security:
 * - Requires authentication
 * - Only receives events for works user has access to
 * - Permissions validated in real-time
 */
router.get(
  '/',
  requireAuth,
  async (req: AuthenticatedRequest, res) => {
    try {
      const userId = req.user!.userId;
      // Get client-provided connection ID (for multi-tab support)
      const clientConnectionId = req.query.connectionId as string | undefined;

      if (!clientConnectionId) {
        return sendBadRequest(res, 'connectionId query parameter is required');
      }

      // Fetch all initial data in parallel
      const [
        ownedWorks,
        sharedWorks,
        allRunningSessions,
        userPermissionsAndLimits,
      ] = await Promise.all([
        // Works owned by user
        WorkModel.findByUserId(userId),

        // Works shared with user
        WorkAccessService.getSharedWithUser(userId),

        // All running sessions across accessible works
        TimeSessionModel.findAllRunningForUser(userId),

        // User's system permissions and limits
        PermissionService.getUserPermissionsAndLimits(userId),
      ]);

      // Prepare unified initial snapshot
      const snapshot = {
        // User account data
        user: {
          permissions: userPermissionsAndLimits.permissions,
          limits: userPermissionsAndLimits.limits,
        },

        // Dashboard data
        ownedWorks,
        sharedWorks,
        runningSessions: allRunningSessions,

        // Metadata
        timestamp: new Date().toISOString(),
        connectionId: clientConnectionId, // Include connectionId in snapshot for frontend confirmation
      };

      // Setup unified SSE connection with client-provided connection ID
      await unifiedSseService.setupConnection(userId, clientConnectionId, res, snapshot);

      // Connection will stay open until client disconnects
      // Updates sent via unifiedSseService.emitToUser() and emitToWork()

    } catch (error) {
      console.error('[Stream] Error setting up unified connection:', error);
      if (!res.headersSent) {
        sendInternalError(res, 'Failed to establish stream');
      }
    }
  }
);

/**
 * Context Management Endpoint
 *
 * PUT /api/stream/context
 *
 * Updates user's current viewing context (dashboard vs specific work)
 * Triggers dynamic subscription changes in SSE connection
 *
 * Body:
 * - { workId: number } - User navigated to work page
 * - { workId: null }   - User navigated to dashboard
 *
 * Server action:
 * - Subscribe to work:X:updates channel (if workId provided)
 * - Unsubscribe from previous work channel
 * - Send work snapshot through existing SSE connection
 */

const contextSchema = z.object({
  workId: z.number().int().positive().nullable(),
  connectionId: z.string().min(1), // Client-provided connection ID for multi-tab support
});

router.put(
  '/context',
  requireAuth,
  validateBody(contextSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.userId;
    const { workId, connectionId } = req.body;

    // If workId provided, validate access
    let workSnapshot = null;
    if (workId !== null) {
      // Check work access
      const access = await WorkAccessService.checkAccess(userId, workId);
      if (!access.canView) {
        return sendBadRequest(res, 'No access to this work');
      }

      // Fetch work snapshot data in parallel
      const [
        work,
        sessions,
        timeline,
        files,
        stats,
        shares,
        permissions,
      ] = await Promise.all([
        WorkModel.findByIdWithAccess(workId),
        TimeSessionModel.findByWorkIdWithAccess(workId),
        TimelineEntryModel.findByWorkIdWithAccess(workId),
        FileStorageModel.findByWorkIdWithAccess(workId),
        TimeSessionModel.getTotalDurationWithAccess(workId),
        access.isOwner ? WorkAccessService.getWorkShares(workId, userId) : null,
        access,
      ]);

      if (!work) {
        return sendNotFound(res, 'Work not found');
      }

      workSnapshot = {
        work,
        sessions,
        timeline,
        files,
        stats: { totalDuration: stats },
        shares: shares || [],
        permissions,
      };
    }

    // Update SSE connection context for THIS SPECIFIC connection (multi-tab support)
    await unifiedSseService.updateContext(userId, connectionId, workId);

    // Send work snapshot if navigating to work page
    // Emit to SPECIFIC connection only (not all user connections)
    if (workSnapshot) {
      await unifiedSseService.emitToConnection(userId, connectionId, 'work:snapshot', workSnapshot);
    }

    sendSuccess(res, {
      workId,
      snapshot: workSnapshot !== null,
    });
  })
);

// Helper functions removed - now using PermissionService

export default router;
