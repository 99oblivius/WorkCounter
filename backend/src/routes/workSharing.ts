import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess, requireWorkOwnership } from '../middleware/authorization.js';
import { requirePermission } from '../middleware/rbac.js';
import { parseNumericParams } from '../middleware/parseNumericParams.js';
import { validateBody } from '../middleware/validateRequest.js';
import { permissionLevelEnum } from '../utils/commonSchemas.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { WorkModel } from '../models/Work.js';
import { AuditService } from '../services/auditService.js';
import { unifiedSseService } from '../services/unifiedSseService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { query } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';
import {
  sendSuccess,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  sendInternalError
} from '../utils/apiResponse.js';

const router = Router();

// Validation schemas
const shareWorkSchema = z.object({
  usernameOrEmail: z.string().min(1, 'Username or email is required'),
  permissionLevel: permissionLevelEnum.optional().default('viewer'),
});

// SECURITY: Require authentication for all work sharing routes
router.use(requireAuth);

// Get users a work is shared with
// SECURITY: Only owners can see who they've shared with
router.get(
  '/:workId/shares',
  parseNumericParams(['workId']),
  requireWorkOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const workId = req.params.workId as unknown as number; // parseNumericParams already converted
    const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);

    sendSuccess(res, { shares });
  })
);

// Share work with user
// SECURITY FIX: Changed from requireWorkAccess('edit') to requireWorkOwnership
// Only the actual owner can share their work, not editors
// ENHANCEMENT: Accept username or email
router.post(
  '/:workId/share',
  parseNumericParams(['workId']),
  requireWorkOwnership,
  requirePermission('works.share'),
  validateBody(shareWorkSchema),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const workId = req.params.workId as unknown as number;
    const { usernameOrEmail, permissionLevel } = req.body;

    const access = await WorkAccessService.checkAccess(req.user!.userId, workId);
    if (!access.isOwner) {
      await AuditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'work.share_denied',
        resourceType: 'work',
        resourceId: workId,
        details: { reason: 'not_owner', attemptedToShare: usernameOrEmail },
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      return sendForbidden(res, 'Only the work owner can share this work');
    }

    const userResult = await query<{ id: number }>(
      'SELECT id FROM users WHERE username = $1 OR email = $1',
      [usernameOrEmail]
    );

    let isUpdate = false;
    let previousPermissionLevel: string | null = null;
    if (userResult.rows.length > 0) {
      const sharedWithUserId = userResult.rows[0].id;
      const existingShare = await query<{ permission_level: string }>(
        'SELECT permission_level FROM work_shares WHERE work_id = $1 AND shared_with_user_id = $2',
        [workId, sharedWithUserId]
      );
      if (existingShare.rows.length > 0) {
        isUpdate = true;
        previousPermissionLevel = existingShare.rows[0].permission_level;
      }
    }

    await WorkAccessService.shareWork(
      workId,
      req.user!.userId,
      usernameOrEmail,
      req.user!.userId,
      permissionLevel
    );

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: isUpdate ? 'work.share_updated' : 'work.shared',
      resourceType: 'work',
      resourceId: workId,
      details: {
        sharedWith: usernameOrEmail,
        permissionLevel,
        ...(isUpdate && { previousPermissionLevel })
      },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);
    const eventType = isUpdate ? 'share:update' : 'share:add';
    await unifiedSseService.emitToWork(workId, eventType, { shares, workId });

    if (userResult.rows.length > 0) {
      const sharedWithUserId = userResult.rows[0].id;

      if (isUpdate) {
        await unifiedSseService.emitToUser(sharedWithUserId, 'permissions:updated', {
          action: 'share_permission_updated',
          workId,
          permissionLevel,
          previousPermissionLevel,
        });
      } else {
        const work = await WorkModel.findByIdWithAccess(workId);
        if (work) {
          const ownerResult = await query<{ username: string }>(
            'SELECT username FROM users WHERE id = $1',
            [work.user_id]
          );
          await unifiedSseService.emitToUser(sharedWithUserId, 'work:shared', {
            ...work,
            permissionLevel,
            ownerUsername: ownerResult.rows[0]?.username,
          });
        }
      }
    }

    sendSuccess(res, { success: true });
  })
);

// Unshare work (remove user access)
// SECURITY FIX: Changed from requireWorkAccess('edit') to requireWorkOwnership
// ENHANCEMENT: Accept username or email in path
router.delete(
  '/:workId/share/:identifier',
  parseNumericParams(['workId']),
  requireWorkOwnership,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const workId = req.params.workId as unknown as number; // parseNumericParams already converted
    const { identifier } = req.params;

    // DEFENSE-IN-DEPTH: Double-check ownership
    const access = await WorkAccessService.checkAccess(req.user!.userId, workId);
    if (!access.isOwner) {
      await AuditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'work.unshare_denied',
        resourceType: 'work',
        resourceId: workId,
        details: { reason: 'not_owner', attemptedToRemove: identifier },
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
      return sendForbidden(res, 'Only the work owner can unshare this work');
    }

    const userResult = await query<{ id: number }>(
      'SELECT id FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );
    const unsharedUserId = userResult.rows.length > 0 ? userResult.rows[0].id : null;

    await WorkAccessService.unshareWork(workId, req.user!.userId, identifier);

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'work.unshared',
      resourceType: 'work',
      resourceId: workId,
      details: { removedUser: identifier },
      status: 'success',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);
    await unifiedSseService.emitToWork(workId, 'share:remove', { shares, workId });

    if (unsharedUserId) {
      await unifiedSseService.emitToUser(unsharedUserId, 'work:unshared', { workId });
    }

    sendSuccess(res, { success: true });
  })
);

router.post(
  '/:workId/leave',
  parseNumericParams(['workId']),
  requireWorkAccess('view'),
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const workId = req.params.workId as unknown as number;

    const access = await WorkAccessService.checkAccess(req.user!.userId, workId);
    if (access.isOwner) {
      return sendBadRequest(res, 'Cannot leave your own work');
    }

    await WorkAccessService.removeFromMySharedWorks(workId, req.user!.userId);

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'work.left_shared',
      resourceType: 'work',
      resourceId: workId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    // Notify user via SSE that they've left the work (user-level stream)
    await unifiedSseService.emitToUser(req.user!.userId, 'work:unshared', { workId });

    sendSuccess(res, { success: true });
  })
);

router.get(
  '/shared-with-me',
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    if (!req.user) {
      return sendUnauthorized(res);
    }

    const sharedWorks = await WorkAccessService.getSharedWithUser(req.user.userId);
    sendSuccess(res, sharedWorks);
  })
);

export default router;
