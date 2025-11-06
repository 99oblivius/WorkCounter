import { Request, Response, NextFunction } from 'express';
import { RoleService } from '../services/roleService.js';
import { AuditService } from '../services/auditService.js';

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
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
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

        return res.status(403).json({
          error: 'Forbidden',
          message: 'You do not have permission to perform this action'
        });
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Check if user has any of the specified permissions
 */
export const requireAnyPermission = (permissions: string[]) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const hasAnyPermission = await RoleService.userHasAnyPermission(
        req.user.userId,
        permissions
      );

      if (!hasAnyPermission) {
        return res.status(403).json({ error: 'Forbidden' });
      }

      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

/**
 * Attach user permissions to request for use in handlers
 */
export const attachPermissions = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user) {
    try {
      const permissions = await RoleService.getUserPermissions(req.user.userId);
      req.user.permissions = permissions;
    } catch (error) {
      console.error('Error attaching permissions:', error);
    }
  }
  next();
};
