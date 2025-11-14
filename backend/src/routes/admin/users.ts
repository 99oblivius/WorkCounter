import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { parseNumericParams } from '../../middleware/parseNumericParams.js';
import { preventOwnerModification, preventDangerousModification } from '../../middleware/ownerProtection.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { UserModel } from '../../models/User.js';
import { RoleService } from '../../services/roleService.js';
import { AuditService } from '../../services/auditService.js';
import { PasswordService } from '../../services/passwordService.js';
import { unifiedSseService } from '../../services/unifiedSseService.js';
import { rateLimiters } from '../../utils/rateLimiters.js';
import type { AuthenticatedRequest } from '../../middleware/rbac.js';
import { query, withTransaction } from '../../config/database.js';
import {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendForbidden,
  sendNotFound,
  sendConflict,
  sendInternalError
} from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

const router = Router();

// Validation schemas
const createUserSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  email: z.string().email('Valid email is required'),
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(1, 'New password is required'),
});

// Apply authentication to all admin routes
// Apply authentication and rate limiting to all admin routes
router.use(requireAuth);
router.use(rateLimiters.admin);

// Get all users with their roles
router.get('/', requirePermission('admin.users.view'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const result = await query(`
    SELECT
      u.id,
      u.username,
      u.email,
      u.is_active,
      u.last_login_at,
      u.created_at,
      json_agg(json_build_object('id', r.id, 'name', r.name, 'displayName', r.display_name)) FILTER (WHERE r.id IS NOT NULL) as roles
    FROM users u
    LEFT JOIN user_roles ur ON u.id = ur.user_id
    LEFT JOIN roles r ON ur.role_id = r.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  sendSuccess(res, result.rows);
}));

// Create new user
router.post('/', requirePermission('admin.users.create'), validateBody(createUserSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const { username, email } = req.body;

  // Check if user already exists
  const existingUser = await query(
    'SELECT id FROM users WHERE email = $1 OR username = $2',
    [email, username]
  );

  if (existingUser.rows.length > 0) {
    return sendConflict(res, 'User with this email or username already exists');
  }

  // Generate a secure temporary password
  const temporaryPassword = PasswordService.generatePassword(16);
  const passwordHash = await PasswordService.hashPassword(temporaryPassword);

  // Create user atomically with password and role assignment
  const newUserId = await withTransaction(async (client) => {
    // Create user (no authentik_id needed for native auth)
    const result = await client.query<{ id: number }>(
      `INSERT INTO users (username, email, is_active, force_password_reset)
       VALUES ($1, $2, true, true)
       RETURNING id`,
      [username, email]
    );

    const userId = result.rows[0].id;

    // Set the temporary password
    await client.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, userId]
    );

    // Grant default 'user' role
    const userRole = await client.query('SELECT id FROM roles WHERE name = $1', ['user']);
    if (userRole.rows.length > 0) {
      await client.query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [userId, userRole.rows[0].id]
      );
    }

    return userId;
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.created',
    resourceType: 'user',
    resourceId: newUserId,
    details: { username, email, method: 'native_auth' },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendCreated(res, {
    id: newUserId,
    username,
    email,
    temporaryPassword, // Return once - client should display this securely
  });
}));

// Get single user with full details
router.get('/:id', parseNumericParams(['id']), requirePermission('admin.users.view'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await UserModel.findById(userId);

  if (!user) {
    return sendNotFound(res, 'User not found');
  }

  // Get user roles
  const userRoles = await RoleService.getUserRoles(userId);

  // Get permissions for each role
  const rolesWithPermissions = await Promise.all(
    userRoles.map(async (role) => {
      const permsResult = await query<{
        id: number;
        name: string;
        display_name: string;
        description: string;
        category: string;
      }>(
        `SELECT p.*
         FROM permissions p
         JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = $1
         ORDER BY p.category, p.name`,
        [role.id]
      );

      return {
        ...role,
        permissions: permsResult.rows.map(p => ({
          id: p.id,
          name: p.name,
          displayName: p.display_name,
          description: p.description,
          category: p.category
        }))
      };
    })
  );

  sendSuccess(res, {
    ...user,
    roles: rolesWithPermissions
  });
}));

// Grant role to user
router.post('/:id/roles/:roleId', parseNumericParams(['id', 'roleId']), requirePermission('admin.users.roles'), preventDangerousModification(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const roleId = parseInt(req.params.roleId, 10);

  await RoleService.grantRole(userId, roleId, req.user!.userId);

  // Emit SSE event to notify user of permission change
  await unifiedSseService.emitToUser(userId, 'permissions:updated', {
    action: 'role_granted',
    roleId,
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.role_granted',
    resourceType: 'user',
    resourceId: userId,
    details: { grantedRoleId: roleId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

// Revoke role from user
router.delete('/:id/roles/:roleId', parseNumericParams(['id', 'roleId']), requirePermission('admin.users.roles'), preventDangerousModification(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const roleId = parseInt(req.params.roleId, 10);

  await RoleService.revokeRole(userId, roleId);

  // Emit SSE event to notify user of permission change
  await unifiedSseService.emitToUser(userId, 'permissions:updated', {
    action: 'role_revoked',
    roleId,
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.role_revoked',
    resourceType: 'user',
    resourceId: userId,
    details: { revokedRoleId: roleId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

// Deactivate user
router.patch('/:id/deactivate', parseNumericParams(['id']), requirePermission('admin.users.deactivate'), preventDangerousModification(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);

  await query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

  // Invalidate permission cache for deactivated user
  const { PermissionCache } = await import('../../services/cache/permissionCache.js');
  PermissionCache.invalidate(userId);

  // Emit SSE event to notify user they've been deactivated
  await unifiedSseService.emitToUser(userId, 'account:deactivated', {
    message: 'Your account has been deactivated. Please contact an administrator.',
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.deactivated',
    resourceType: 'user',
    resourceId: userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

// Activate user
router.patch('/:id/activate', parseNumericParams(['id']), requirePermission('admin.users.deactivate'), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);

  await query('UPDATE users SET is_active = true WHERE id = $1', [userId]);

  // Invalidate permission cache for activated user
  const { PermissionCache } = await import('../../services/cache/permissionCache.js');
  PermissionCache.invalidate(userId);

  // Notify user they've been reactivated
  await unifiedSseService.emitToUser(userId, 'account:activated', {
    message: 'Your account has been reactivated. You may now access the application.',
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.activated',
    resourceType: 'user',
    resourceId: userId,
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

// Delete user
router.delete('/:id', parseNumericParams(['id']), requirePermission('admin.users.delete'), preventDangerousModification(), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);

  // Delete user atomically and capture user info for audit log
  const deletedUser = await withTransaction(async (client) => {
    // Get user info before deletion for audit log
    const userResult = await client.query(
      'SELECT id, username, email FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = userResult.rows[0];

    // Delete user (CASCADE will handle related records:
    // user_roles, time_sessions, works, audit_logs, etc.)
    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    return user;
  });

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.deleted',
    resourceType: 'user',
    resourceId: userId,
    details: { deletedUsername: deletedUser.username, deletedEmail: deletedUser.email },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

// Reset user password (admin sets new password)
router.post('/:id/reset-password', parseNumericParams(['id']), requirePermission('admin.users.reset_password'), preventOwnerModification(), validateBody(resetPasswordSchema), asyncHandler(async (req: AuthenticatedRequest, res) => {
  const userId = parseInt(req.params.id, 10);
  const { newPassword } = req.body;

  // Validate password
  const validation = PasswordService.validatePassword(newPassword);
  if (!validation.valid) {
    return sendBadRequest(res, 'Password does not meet requirements', validation.errors);
  }

  // Get user
  const user = await UserModel.findById(userId);
  if (!user) {
    return sendNotFound(res, 'User not found');
  }

  // Set new password and force password change on next login
  await UserModel.setPassword(userId, newPassword);

  await AuditService.log({
    userId: req.user!.userId,
    username: req.user!.username,
    action: 'user.password_reset_by_admin',
    resourceType: 'user',
    resourceId: userId,
    details: { targetUsername: user.username },
    ipAddress: req.ip,
    userAgent: req.get('user-agent')
  });

  sendSuccess(res, { success: true });
}));

export default router;
