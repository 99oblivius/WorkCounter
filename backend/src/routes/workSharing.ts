import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireWorkAccess, requireWorkOwnership } from '../middleware/authorization.js';
import { requirePermission } from '../middleware/rbac.js';
import { WorkAccessService } from '../services/workAccessService.js';
import { WorkModel } from '../models/Work.js';
import { AuditService } from '../services/auditService.js';
import { sseService } from '../services/sseService.js';
import { query } from '../config/database.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

// SECURITY: Require authentication for all work sharing routes
router.use(requireAuth);

// Get users a work is shared with
// SECURITY: Only owners can see who they've shared with
router.get(
  '/:workId/shares',
  requireWorkOwnership,
  async (req: AuthenticatedRequest, res) => {
    try {
      const workId = parseInt(req.params.workId);
      const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);

      res.json({ shares });
    } catch (error) {
      console.error('Error getting work shares:', error);
      res.status(500).json({ error: 'Failed to get work shares' });
    }
  }
);

// Share work with user
// SECURITY FIX: Changed from requireWorkAccess('edit') to requireWorkOwnership
// Only the actual owner can share their work, not editors
// ENHANCEMENT: Accept username or email
router.post(
  '/:workId/share',
  requireWorkOwnership,
  requirePermission('works.share'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workId = parseInt(req.params.workId);
      const { usernameOrEmail, permissionLevel } = req.body;

      if (!usernameOrEmail) {
        return res.status(400).json({ error: 'Username or email required' });
      }

      // Validate permission level
      const validLevels = ['viewer', 'editor', 'manager'];
      const level = permissionLevel || 'viewer';
      if (!validLevels.includes(level)) {
        return res.status(400).json({ error: 'Invalid permission level. Must be: viewer, editor, or manager' });
      }

      // DEFENSE-IN-DEPTH: Double-check ownership even though middleware verified it
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
        return res.status(403).json({ error: 'Only the work owner can share this work' });
      }

      await WorkAccessService.shareWork(
        workId,
        req.user!.userId,
        usernameOrEmail,
        req.user!.userId,
        level
      );

      await AuditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'work.shared',
        resourceType: 'work',
        resourceId: workId,
        details: { sharedWith: usernameOrEmail, permissionLevel: level },
        status: 'success',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      // Emit SSE event for work-level stream
      const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);
      await sseService.emitWorkUpdate(workId, 'share:add', { shares });

      // Notify the user who received the share (user-level stream)
      const userResult = await query<{ id: number }>(
        'SELECT id FROM users WHERE username = $1 OR email = $1',
        [usernameOrEmail]
      );
      if (userResult.rows.length > 0) {
        const sharedWithUserId = userResult.rows[0].id;
        const work = await WorkModel.findByIdWithAccess(workId);
        if (work) {
          await sseService.emitUserUpdate(sharedWithUserId, 'work:shared', {
            ...work,
            permissionLevel: level,
          });
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error sharing work:', error);

      await AuditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'work.share_failed',
        resourceType: 'work',
        resourceId: parseInt(req.params.workId),
        details: { error: error.message },
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(400).json({ error: error.message || 'Failed to share work' });
    }
  }
);

// Unshare work (remove user access)
// SECURITY FIX: Changed from requireWorkAccess('edit') to requireWorkOwnership
// ENHANCEMENT: Accept username or email in path
router.delete(
  '/:workId/share/:identifier',
  requireWorkOwnership,
  async (req: AuthenticatedRequest, res) => {
    try {
      const workId = parseInt(req.params.workId);
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
        return res.status(403).json({ error: 'Only the work owner can unshare this work' });
      }

      // Get user ID before unsharing (for SSE notification)
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

      // Emit SSE event for work-level stream
      const shares = await WorkAccessService.getWorkShares(workId, req.user!.userId);
      await sseService.emitWorkUpdate(workId, 'share:remove', { shares });

      // Notify the user who lost access (user-level stream)
      if (unsharedUserId) {
        await sseService.emitUserUpdate(unsharedUserId, 'work:unshared', { workId });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('Error unsharing work:', error);

      await AuditService.log({
        userId: req.user!.userId,
        username: req.user!.username,
        action: 'work.unshare_failed',
        resourceType: 'work',
        resourceId: parseInt(req.params.workId),
        details: { error: error.message },
        status: 'failure',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.status(400).json({ error: error.message || 'Failed to unshare work' });
    }
  }
);

// Remove work from my shared works (as sharee)
router.post(
  '/:workId/leave',
  requireWorkAccess('view'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const workId = parseInt(req.params.workId);

      // Verify this is a shared work
      const access = await WorkAccessService.checkAccess(req.user!.userId, workId);
      if (access.isOwner) {
        return res.status(400).json({ error: 'Cannot leave your own work' });
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
      await sseService.emitUserUpdate(req.user!.userId, 'work:unshared', { workId });

      res.json({ success: true });
    } catch (error) {
      console.error('Error leaving shared work:', error);
      res.status(500).json({ error: 'Failed to leave shared work' });
    }
  }
);

// Get all works shared with me
router.get(
  '/shared-with-me',
  async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const sharedWorks = await WorkAccessService.getSharedWithUser(req.user.userId);
      res.json(sharedWorks);
    } catch (error) {
      console.error('Error getting shared works:', error);
      res.status(500).json({ error: 'Failed to get shared works' });
    }
  }
);

export default router;
