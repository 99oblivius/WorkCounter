import { Response, NextFunction } from 'express';
import { sendForbidden, sendBadRequest } from '../utils/apiResponse.js';
import { AuthenticatedRequest } from './rbac.js';

/**
 * Owner account ID (typically the first user created)
 * This can be configured via environment variable for flexibility
 */
const OWNER_ACCOUNT_ID = parseInt(process.env.OWNER_ACCOUNT_ID || '1', 10);

/**
 * Middleware to prevent modification of the owner account
 *
 * Protects against accidental or malicious changes to the primary admin account
 *
 * Usage:
 *   router.delete('/:id', preventOwnerModification(), asyncHandler(async (req, res) => {
 *     // Safe to delete - owner account is protected
 *   }));
 */
export function preventOwnerModification() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const targetUserId = parseInt(req.params.id, 10);

    // Validate that parsing succeeded
    if (isNaN(targetUserId) || !Number.isFinite(targetUserId)) {
      return sendBadRequest(res, 'Invalid user ID');
    }

    if (targetUserId === OWNER_ACCOUNT_ID) {
      return sendForbidden(res, 'Cannot modify the owner account');
    }

    next();
  };
}

/**
 * Middleware to prevent self-modification in sensitive operations
 *
 * Prevents users from accidentally removing their own admin access
 *
 * Usage:
 *   router.patch('/:id/deactivate', preventSelfModification(), asyncHandler(...));
 */
export function preventSelfModification() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const targetUserId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.userId;

    // Validate that parsing succeeded
    if (isNaN(targetUserId) || !Number.isFinite(targetUserId)) {
      return sendBadRequest(res, 'Invalid user ID');
    }

    if (currentUserId && targetUserId === currentUserId) {
      return sendForbidden(res, 'Cannot modify your own account');
    }

    next();
  };
}

/**
 * Combined middleware to prevent both owner and self-modification
 *
 * Usage:
 *   router.delete('/:id', preventDangerousModification(), asyncHandler(...));
 */
export function preventDangerousModification() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const targetUserId = parseInt(req.params.id, 10);
    const currentUserId = req.user?.userId;

    // Validate that parsing succeeded
    if (isNaN(targetUserId) || !Number.isFinite(targetUserId)) {
      return sendBadRequest(res, 'Invalid user ID');
    }

    if (targetUserId === OWNER_ACCOUNT_ID) {
      return sendForbidden(res, 'Cannot modify the owner account');
    }

    if (currentUserId && targetUserId === currentUserId) {
      return sendForbidden(res, 'Cannot modify your own account');
    }

    next();
  };
}

/**
 * Helper to check if a user is the owner account
 */
export function isOwnerAccount(userId: number): boolean {
  return userId === OWNER_ACCOUNT_ID;
}
