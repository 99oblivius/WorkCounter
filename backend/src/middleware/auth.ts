import { Response, NextFunction } from 'express';
import { UserModel } from '../models/User.js';
import { sendUnauthorized, sendInternalError } from '../utils/apiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthenticatedRequest } from './rbac.js';
import '../types/index.js';

/**
 * Native authentication middleware
 * Checks if user session exists and user is still active
 */
export const requireAuth = asyncHandler(async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  if (!req.session.user) {
    return sendUnauthorized(res, 'Unauthorized');
  }

  // Verify user is still active in database
  const user = await UserModel.findById(req.session.user.userId);

  if (!user) {
    // User deleted - destroy session
    req.session.destroy(() => {});
    return sendUnauthorized(res, 'User not found');
  }

  if (!user.is_active) {
    // User deactivated - destroy session
    req.session.destroy(() => {});
    return sendUnauthorized(res, 'Your account has been deactivated. Please contact an administrator.');
  }

  // Populate req.user for RBAC middleware
  req.user = req.session.user;
  next();
});
