import { Response, NextFunction } from 'express';
import { WorkAccessService } from '../services/workAccessService.js';
import { RoleService } from '../services/roleService.js';
import { AuditService } from '../services/auditService.js';
import { sendUnauthorized, sendBadRequest, sendForbidden } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthenticatedRequest } from './rbac.js';
import type { WorkAccessInfo } from '../services/workAccessService.js';

// Extended request interface for work access data
export interface WorkAccessRequest extends AuthenticatedRequest {
  workAccess?: WorkAccessInfo;
  canBypassSizeLimits?: boolean;
}

/**
 * Check if user can perform action on work
 */
export const requireWorkAccess = (action: 'view' | 'edit' | 'delete') => {
  return asyncHandler(async (req: WorkAccessRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Unauthorized');
    }

    const workId = parseInt(req.params.workId || req.params.id);
    if (isNaN(workId)) {
      return sendBadRequest(res, 'Invalid work ID');
    }

    const access = await WorkAccessService.checkAccess(req.user.userId, workId);

    switch (action) {
      case 'view':
        if (!access.canView) {
          return sendForbidden(res, 'Cannot view this work');
        }
        break;
      case 'edit':
        if (!access.canEdit) {
          return sendForbidden(res, 'Cannot edit this work');
        }
        break;
      case 'delete':
        if (!access.canDelete) {
          return sendForbidden(res, 'Cannot delete this work');
        }
        break;
    }

    // Attach access info to request
    req.workAccess = access;
    next();
  });
};

/**
 * Check if user owns resource or is admin
 */
export const requireResourceOwnership = (
  resourceType: 'session' | 'timeline' | 'file'
) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Unauthorized');
    }

    const resourceId = parseInt(req.params.id);
    if (isNaN(resourceId)) {
      return sendBadRequest(res, 'Invalid resource ID');
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
        return sendForbidden(res, `Cannot access this ${resourceType}`);
      }
    }

    next();
  });
};

/**
 * Check file upload permission with size bypass
 */
export const checkFileUploadPermission = asyncHandler(async (
  req: WorkAccessRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return sendUnauthorized(res, 'Unauthorized');
  }

  const hasUploadPerm = await RoleService.userHasPermission(
    req.user.userId,
    'files.upload'
  );

  if (!hasUploadPerm) {
    return sendForbidden(res, 'File upload not permitted');
  }

  // Check if user can bypass size limits
  const canBypass = await RoleService.userHasPermission(
    req.user.userId,
    'files.bypass_size_limits'
  );

  req.canBypassSizeLimits = canBypass;

  next();
});

/**
 * Check attachment upload permission (images on notes/timeline)
 */
export const checkAttachmentUploadPermission = asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return sendUnauthorized(res, 'Unauthorized');
  }

  const hasPermission = await RoleService.userHasPermission(
    req.user.userId,
    'attachments.upload'
  );

  if (!hasPermission) {
    return sendForbidden(res, 'Attachment upload not permitted. Contact administrator for access.');
  }

  next();
});

/**
 * SECURITY: Require work ownership (not just edit/delete permission)
 * Only the actual owner can share/unshare work
 */
export const requireWorkOwnership = asyncHandler(async (
  req: WorkAccessRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return sendUnauthorized(res, 'Unauthorized');
  }

  const workId = parseInt(req.params.workId || req.params.id);
  if (isNaN(workId)) {
    return sendBadRequest(res, 'Invalid work ID');
  }

  const access = await WorkAccessService.checkAccess(req.user.userId, workId);

  // STRICT: Only owners can perform this action
  if (!access.isOwner) {
    await AuditService.log({
      userId: req.user.userId,
      username: req.user.username,
      action: 'access_denied',
      resourceType: 'work',
      resourceId: workId,
      details: { reason: 'owner_only_action_attempted', workId },
      ipAddress: req.ip || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      status: 'failure'
    });
    return sendForbidden(res, 'Only the work owner can perform this action');
  }

  // Attach access info to request
  req.workAccess = access;
  next();
});
