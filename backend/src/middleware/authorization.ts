import { Response, NextFunction } from 'express';
import { WorkAccessService } from '../services/workAccessService.js';
import { RoleService } from '../services/roleService.js';
import type { AuthenticatedRequest } from './rbac.js';

/**
 * Check if user can perform action on work
 */
export const requireWorkAccess = (action: 'view' | 'edit' | 'delete') => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const workId = parseInt(req.params.workId || req.params.id);
      if (isNaN(workId)) {
        return res.status(400).json({ error: 'Invalid work ID' });
      }

      const access = await WorkAccessService.checkAccess(req.user.userId, workId);

      switch (action) {
        case 'view':
          if (!access.canView) {
            return res.status(403).json({ error: 'Cannot view this work' });
          }
          break;
        case 'edit':
          if (!access.canEdit) {
            return res.status(403).json({ error: 'Cannot edit this work' });
          }
          break;
        case 'delete':
          if (!access.canDelete) {
            return res.status(403).json({ error: 'Cannot delete this work' });
          }
          break;
      }

      // Attach access info to request
      (req as any).workAccess = access;
      next();
    } catch (error) {
      console.error('Work access check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user owns resource or is admin
 */
export const requireResourceOwnership = (
  resourceType: 'session' | 'timeline' | 'file'
) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const resourceId = parseInt(req.params.id);
      if (isNaN(resourceId)) {
        return res.status(400).json({ error: 'Invalid resource ID' });
      }

      const owns = await WorkAccessService.ownsResource(
        req.user.userId,
        resourceType,
        resourceId
      );

      if (!owns) {
        // Check if admin (admins can edit anything)
        const hasAdminAccess = await RoleService.userHasPermission(
          req.user.userId,
          'admin.access'
        );

        if (!hasAdminAccess) {
          // FIX: Pass ownership check failure to route handler
          // Route handler can distinguish between "doesn't exist" vs "not owned"
          (req as any).ownershipCheckFailed = true;
        }
      }

      next();
    } catch (error) {
      console.error('Resource ownership check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check file upload permission with size bypass
 */
export const checkFileUploadPermission = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasUploadPerm = await RoleService.userHasPermission(
      req.user.userId,
      'files.upload'
    );

    if (!hasUploadPerm) {
      return res.status(403).json({ error: 'File upload not permitted' });
    }

    // Check if user can bypass size limits
    const canBypass = await RoleService.userHasPermission(
      req.user.userId,
      'files.bypass_size_limits'
    );

    (req as any).canBypassSizeLimits = canBypass;

    next();
  } catch (error) {
    console.error('File upload permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Check attachment upload permission (images on notes/timeline)
 */
export const checkAttachmentUploadPermission = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hasPermission = await RoleService.userHasPermission(
      req.user.userId,
      'attachments.upload'
    );

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Attachment upload not permitted. Contact administrator for access.'
      });
    }

    next();
  } catch (error) {
    console.error('Attachment permission check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * SECURITY: Require work ownership (not just edit/delete permission)
 * Only the actual owner can share/unshare work
 */
export const requireWorkOwnership = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const workId = parseInt(req.params.workId || req.params.id);
    if (isNaN(workId)) {
      return res.status(400).json({ error: 'Invalid work ID' });
    }

    const access = await WorkAccessService.checkAccess(req.user.userId, workId);

    // STRICT: Only owners can perform this action
    if (!access.isOwner) {
      console.warn(`[SECURITY] Non-owner user ${req.user.userId} attempted to perform owner-only action on work ${workId}`);
      return res.status(403).json({
        error: 'Only the work owner can perform this action'
      });
    }

    // Attach access info to request
    (req as any).workAccess = access;
    next();
  } catch (error) {
    console.error('Work ownership check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
