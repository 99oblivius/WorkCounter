import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { RoleService } from '../../services/roleService.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { sendSuccess, sendInternalError } from '../../utils/apiResponse.js';
import { rateLimiters } from '../../utils/rateLimiters.js';

const router = Router();

// Apply authentication and rate limiting to all admin routes
router.use(requireAuth);
router.use(rateLimiters.admin);

// Get all roles with permissions
router.get('/', requirePermission('admin.users.view'), asyncHandler(async (req, res) => {
  const roles = await RoleService.getAllRoles();
  sendSuccess(res, roles);
}));

// Get all permissions grouped by category
router.get('/permissions', requirePermission('admin.users.view'), asyncHandler(async (req, res) => {
  const permissions = await RoleService.getAllPermissions();
  sendSuccess(res, permissions);
}));

export default router;
