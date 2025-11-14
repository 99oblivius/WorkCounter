import { query } from '../config/database.js';
import { PermissionCache } from './cache/permissionCache.js';

interface Role {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  isSystem: boolean;
}

interface Permission {
  id: number;
  name: string;
  displayName: string;
  description?: string;
  category: string;
}

export class RoleService {
  /**
   * Get all permissions for a user (from all their roles)
   * SECURITY FIX: Uses locking to prevent race conditions
   */
  static async getUserPermissions(userId: number): Promise<string[]> {
    // Check cache first
    const cached = PermissionCache.get(userId);
    if (cached) return Array.from(cached);

    // SECURITY: Acquire lock to prevent concurrent fetches
    const permissions = await PermissionCache.acquirePermissionLock(userId, async () => {
      // Double-check cache inside lock (another request might have populated it)
      const recheck = PermissionCache.get(userId);
      if (recheck) return recheck;

      // Fetch from database
      const result = await query<{ name: string }>(
        `SELECT DISTINCT p.name
         FROM user_roles ur
         JOIN role_permissions rp ON ur.role_id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         JOIN users u ON ur.user_id = u.id
         WHERE ur.user_id = $1 AND u.is_active = true`,
        [userId]
      );

      const permissions = new Set(result.rows.map(row => row.name));

      // Also get roles for cache
      const rolesResult = await query<{ name: string }>(
        `SELECT r.name
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1`,
        [userId]
      );

      const roles = new Set(rolesResult.rows.map(row => row.name));

      // Cache it
      PermissionCache.set(userId, permissions, roles);

      return permissions;
    });

    return Array.from(permissions);
  }

  /**
   * Check if user has specific permission
   * SECURITY FIX: Removed fragile hardcoded permission count check
   */
  static async userHasPermission(userId: number, permission: string): Promise<boolean> {
    const permissions = await this.getUserPermissions(userId);

    // Direct permission check
    return permissions.includes(permission);
  }

  /**
   * Check if user has ANY of the permissions
   * SECURITY FIX: Removed fragile hardcoded permission count check
   */
  static async userHasAnyPermission(userId: number, permissions: string[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.some(p => userPermissions.includes(p));
  }

  /**
   * Check if user has ALL specified permissions
   * SECURITY FIX: Removed fragile hardcoded permission count check
   */
  static async userHasAllPermissions(userId: number, permissions: string[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return permissions.every(p => userPermissions.includes(p));
  }

  /**
   * Grant role to user
   */
  static async grantRole(
    userId: number,
    roleId: number,
    grantedBy: number
  ): Promise<void> {
    await query(
      `INSERT INTO user_roles (user_id, role_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, role_id) DO NOTHING`,
      [userId, roleId, grantedBy]
    );

    PermissionCache.invalidate(userId);
  }

  /**
   * Revoke role from user
   */
  static async revokeRole(userId: number, roleId: number): Promise<void> {
    // Don't allow revoking base 'user' role
    const roleResult = await query<{ name: string }>(
      'SELECT name FROM roles WHERE id = $1',
      [roleId]
    );

    if (roleResult.rows[0]?.name === 'user') {
      throw new Error('Cannot revoke base user role');
    }

    await query(
      'DELETE FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );

    PermissionCache.invalidate(userId);
  }

  /**
   * Get user's roles
   */
  static async getUserRoles(userId: number): Promise<Array<{ id: number; name: string; displayName: string }>> {
    const result = await query<{ id: number; name: string; display_name: string }>(
      `SELECT r.id, r.name, r.display_name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1
       ORDER BY r.name`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      displayName: row.display_name
    }));
  }

  /**
   * Get all roles with their permissions
   */
  static async getAllRoles(): Promise<Array<Role & { permissions: Permission[] }>> {
    const rolesResult = await query<{
      id: number;
      name: string;
      display_name: string;
      description: string;
      is_system: boolean;
    }>('SELECT * FROM roles ORDER BY id');

    const roles = rolesResult.rows;

    const rolesWithPermissions = await Promise.all(
      roles.map(async (role) => {
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
          id: role.id,
          name: role.name,
          displayName: role.display_name,
          description: role.description,
          isSystem: role.is_system,
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

    return rolesWithPermissions;
  }

  /**
   * Get all permissions grouped by category
   */
  static async getAllPermissions(): Promise<Record<string, Permission[]>> {
    const result = await query<{
      id: number;
      name: string;
      display_name: string;
      description: string;
      category: string;
    }>('SELECT * FROM permissions ORDER BY category, name');

    const grouped: Record<string, Permission[]> = {};

    for (const row of result.rows) {
      if (!grouped[row.category]) {
        grouped[row.category] = [];
      }

      grouped[row.category].push({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        description: row.description,
        category: row.category
      });
    }

    return grouped;
  }
}
