import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { PermissionService } from '../services/permissionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { sendSuccess, sendUnauthorized } from '../utils/apiResponse.js';
import type { AuthenticatedRequest } from '../middleware/rbac.js';

const router = Router();

router.use(requireAuth);

/**
 * Get current user's permissions and limits
 * This provides all permission checks and file size limits for the frontend
 */
router.get('/me', asyncHandler(async (req: AuthenticatedRequest, res) => {
  if (!req.user) {
    return sendUnauthorized(res, 'Unauthorized');
  }

  const userId = req.user.userId;

  // Fetch permissions and limits using centralized service
  const { permissions, limits } = await PermissionService.getUserPermissionsAndLimits(userId);

  sendSuccess(res, {
    permissions,
    limits,
  });
}))

export default router;
