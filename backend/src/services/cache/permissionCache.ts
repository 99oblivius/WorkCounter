/**
 * Permission Cache
 * Caches user permissions and roles to reduce database queries
 *
 * REFACTORED: Now uses AbstractCache base class to eliminate duplication
 */

import { AbstractCache } from './AbstractCache.js';

interface CachedPermissions {
  permissions: Set<string>;
  roles: Set<string>;
}

class PermissionCacheImpl extends AbstractCache<number, CachedPermissions> {
  constructor() {
    super(5 * 60 * 1000); // 5 minutes TTL
  }

  /**
   * Get cached permissions for a user
   */
  get(userId: number): Set<string> | null {
    const cached = this.getCached(userId);
    return cached?.permissions || null;
  }

  /**
   * Get cached roles for a user
   */
  getRoles(userId: number): Set<string> | null {
    const cached = this.getCached(userId);
    return cached?.roles || null;
  }

  /**
   * Set cached permissions for a user
   */
  set(userId: number, permissions: Set<string>, roles: Set<string>): void {
    this.setCached(userId, { permissions, roles });
  }

  /**
   * Acquire lock for fetching permissions
   * Prevents multiple concurrent fetches for same user
   */
  async acquirePermissionLock(userId: number, fetchFn: () => Promise<Set<string>>): Promise<Set<string>> {
    const result = await super.acquireLock(userId, async () => {
      const permissions = await fetchFn();
      // Note: roles will be set separately by the caller
      return { permissions, roles: new Set() };
    });
    return result.permissions;
  }

  /**
   * Invalidate cache for specific user or all users
   */
  invalidate(userId?: number): void {
    if (userId !== undefined) {
      this.invalidateKey(userId);
    } else {
      this.invalidateAll();
    }
  }

  /**
   * Invalidate cache when roles change for multiple users
   */
  invalidateOnRoleChange(affectedUserIds: number[]): void {
    affectedUserIds.forEach(id => this.invalidateKey(id));
  }
}

// Singleton instance
export const PermissionCache = new PermissionCacheImpl();
