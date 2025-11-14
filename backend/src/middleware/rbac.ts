import { Request, Response, NextFunction } from 'express';
import { RoleService } from '../services/roleService.js';
import { AuditService } from '../services/auditService.js';
import { sendUnauthorized, sendForbidden } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    email: string;
    username: string;
    permissions?: string[];
  };
}

/**
 * Check if user has specific permission
 */
export const requirePermission = (permission: string) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Unauthorized');
    }

    const hasPermission = await RoleService.userHasPermission(
      req.user.userId,
      permission
    );

    if (!hasPermission) {
      // Log unauthorized access attempt
      await AuditService.log({
        userId: req.user.userId,
        username: req.user.username,
        action: 'access.denied',
        resourceType: 'permission',
        details: { permission, path: req.path },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'failure'
      });

      return sendForbidden(res, 'You do not have permission to perform this action');
    }

    next();
  });
};

/**
 * Check if user has any of the specified permissions
 */
export const requireAnyPermission = (permissions: string[]) => {
  return asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return sendUnauthorized(res, 'Unauthorized');
    }

    const hasAnyPermission = await RoleService.userHasAnyPermission(
      req.user.userId,
      permissions
    );

    if (!hasAnyPermission) {
      // Log unauthorized access attempt for consistency with requirePermission
      await AuditService.log({
        userId: req.user.userId,
        username: req.user.username,
        action: 'access.denied',
        resourceType: 'permission',
        details: { permissions, path: req.path },
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        status: 'failure'
      });

      return sendForbidden(res, 'You do not have permission to perform this action');
    }

    next();
  });
};

/**
 * Attach user permissions to request for use in handlers
 */
export const attachPermissions = asyncHandler(async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user) {
    const permissions = await RoleService.getUserPermissions(req.user.userId);
    req.user.permissions = permissions;
  }
  next();
});
