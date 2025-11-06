import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../middleware/rbac.js';
import { UserModel } from '../../models/User.js';
import { RoleService } from '../../services/roleService.js';
import { AuditService } from '../../services/auditService.js';
import { PasswordService } from '../../services/passwordService.js';
import type { AuthenticatedRequest } from '../../middleware/rbac.js';
import { query } from '../../config/database.js';

const router = Router();

// Apply authentication to all admin routes
router.use(requireAuth);

// Get all users with their roles
router.get('/', requirePermission('admin.users.view'), async (req: AuthenticatedRequest, res) => {
  try {
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

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Create new user
router.post('/', requirePermission('admin.users.create'), async (req: AuthenticatedRequest, res) => {
  try {
    const { username, email } = req.body;

    if (!username || !email) {
      return res.status(400).json({ error: 'Username and email are required' });
    }

    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User with this email or username already exists' });
    }

    // Generate a secure temporary password
    const temporaryPassword = PasswordService.generatePassword(16);

    // Create user (no authentik_id needed for native auth)
    const result = await query<{ id: number }>(
      `INSERT INTO users (username, email, is_active, force_password_reset)
       VALUES ($1, $2, true, true)
       RETURNING id`,
      [username, email]
    );

    const newUserId = result.rows[0].id;

    // Set the temporary password
    await UserModel.setPassword(newUserId, temporaryPassword);

    // Grant default 'user' role
    const userRole = await query('SELECT id FROM roles WHERE name = $1', ['user']);
    if (userRole.rows.length > 0) {
      await query(
        'INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)',
        [newUserId, userRole.rows[0].id]
      );
    }

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

    res.status(201).json({
      id: newUserId,
      username,
      email,
      temporaryPassword, // Return once - client should display this securely
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get single user with full details
router.get('/:id', requirePermission('admin.users.view'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const user = await UserModel.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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

    res.json({
      ...user,
      roles: rolesWithPermissions
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Grant role to user
router.post('/:id/roles/:roleId', requirePermission('admin.users.roles'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const roleId = parseInt(req.params.roleId);

    // Protect owner account (user ID 1) - cannot modify roles
    if (userId === 1) {
      return res.status(403).json({ error: 'Cannot modify roles for the owner account' });
    }

    // Prevent self role change for super important roles
    const currentRoles = await RoleService.getUserRoles(req.user!.userId);
    const hasAdminRole = currentRoles.some(r => r.name === 'admin');

    if (hasAdminRole && userId === req.user!.userId) {
      return res.status(403).json({ error: 'Cannot modify your own admin role' });
    }

    await RoleService.grantRole(userId, roleId, req.user!.userId);

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

    res.json({ success: true });
  } catch (error) {
    console.error('Error granting role:', error);
    res.status(500).json({ error: 'Failed to grant role' });
  }
});

// Revoke role from user
router.delete('/:id/roles/:roleId', requirePermission('admin.users.roles'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const roleId = parseInt(req.params.roleId);

    // Protect owner account (user ID 1) - cannot modify roles
    if (userId === 1) {
      return res.status(403).json({ error: 'Cannot modify roles for the owner account' });
    }

    // Prevent self-deactivation
    if (userId === req.user!.userId) {
      return res.status(403).json({ error: 'Cannot remove your own roles' });
    }

    await RoleService.revokeRole(userId, roleId);

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

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error revoking role:', error);
    res.status(400).json({ error: error.message || 'Failed to revoke role' });
  }
});

// Deactivate user
router.patch('/:id/deactivate', requirePermission('admin.users.deactivate'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Protect owner account (user ID 1) - cannot deactivate
    if (userId === 1) {
      return res.status(403).json({ error: 'Cannot deactivate the owner account' });
    }

    // Prevent self-deactivation
    if (userId === req.user!.userId) {
      return res.status(403).json({ error: 'Cannot deactivate your own account' });
    }

    await query('UPDATE users SET is_active = false WHERE id = $1', [userId]);

    // Invalidate permission cache for deactivated user
    const { PermissionCache } = await import('../../services/cache/permissionCache.js');
    PermissionCache.invalidate(userId);

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'user.deactivated',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({ error: 'Failed to deactivate user' });
  }
});

// Activate user
router.patch('/:id/activate', requirePermission('admin.users.deactivate'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    await query('UPDATE users SET is_active = true WHERE id = $1', [userId]);

    // Invalidate permission cache for activated user
    const { PermissionCache } = await import('../../services/cache/permissionCache.js');
    PermissionCache.invalidate(userId);

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'user.activated',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error activating user:', error);
    res.status(500).json({ error: 'Failed to activate user' });
  }
});

// Delete user
router.delete('/:id', requirePermission('admin.users.delete'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);

    // Protect owner account (user ID 1) - cannot delete
    if (userId === 1) {
      return res.status(403).json({ error: 'Cannot delete the owner account' });
    }

    // Prevent self-deletion
    if (userId === req.user!.userId) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    // Get user info before deletion for audit log
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete user (CASCADE will handle related records)
    await query('DELETE FROM users WHERE id = $1', [userId]);

    await AuditService.log({
      userId: req.user!.userId,
      username: req.user!.username,
      action: 'user.deleted',
      resourceType: 'user',
      resourceId: userId,
      details: { deletedUsername: user.username, deletedEmail: user.email },
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset user password (admin sets new password)
router.post('/:id/reset-password', requirePermission('admin.users.reset_password'), async (req: AuthenticatedRequest, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: 'New password is required' });
    }

    // Owner account can reset their own password, but only via the change password flow
    // This prevents other admins from resetting the owner's password
    if (userId === 1 && req.user!.userId !== 1) {
      return res.status(403).json({ error: 'Cannot reset password for the owner account' });
    }

    // Validate password
    const validation = PasswordService.validatePassword(newPassword);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Password does not meet requirements',
        details: validation.errors
      });
    }

    // Get user
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
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

    res.json({ success: true });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

export default router;
