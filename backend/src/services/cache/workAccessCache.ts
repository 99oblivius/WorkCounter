/**
 * Work Access Cache
 * Caches work access permissions to reduce database queries
 *
 * REFACTORED: Now uses AbstractCache base class to eliminate duplication
 */

import { AbstractCache } from './AbstractCache.js';
import type { WorkPermissionLevel } from '../workAccessService.js';

export interface CachedWorkAccess {
  permissionLevel: WorkPermissionLevel;
  isOwner: boolean;
  isShared: boolean;
  canView: boolean;
  canCreate: boolean;
  canEditOthers: boolean;
  canDeleteOthers: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

class WorkAccessCacheImpl extends AbstractCache<string, CachedWorkAccess> {
  constructor() {
    super(5 * 1000); // 5 seconds TTL (shorter for work permissions)
  }

  /**
   * Generate cache key from userId and workId
   */
  private getCacheKey(userId: number, workId: number): string {
    return `${userId}:${workId}`;
  }

  /**
   * Get cached work access for a user+work pair
   */
  get(userId: number, workId: number): CachedWorkAccess | null {
    const key = this.getCacheKey(userId, workId);
    return this.getCached(key);
  }

  /**
   * Set cached work access for a user+work pair
   */
  set(userId: number, workId: number, access: CachedWorkAccess): void {
    const key = this.getCacheKey(userId, workId);
    this.setCached(key, access);
  }

  /**
   * Acquire lock for fetching work access
   * Prevents multiple concurrent fetches for same user+work
   */
  async acquireWorkAccessLock(
    userId: number,
    workId: number,
    fetchFn: () => Promise<CachedWorkAccess>
  ): Promise<CachedWorkAccess> {
    const key = this.getCacheKey(userId, workId);
    return await super.acquireLock(key, fetchFn);
  }

  /**
   * Invalidate cache for specific user+work pair, all of a user's cached accesses,
   * all accesses for a work, or entire cache
   */
  invalidate(options?: { userId?: number; workId?: number }): void {
    if (!options || (!options.userId && !options.workId)) {
      // Clear entire cache
      this.invalidateAll();
      return;
    }

    if (options.userId && options.workId) {
      // Invalidate specific user+work pair
      const key = this.getCacheKey(options.userId, options.workId);
      this.invalidateKey(key);
      return;
    }

    if (options.userId) {
      // Invalidate all accesses for a user
      const prefix = `${options.userId}:`;
      this.invalidateWhere(key => key.startsWith(prefix));
      return;
    }

    if (options.workId) {
      // Invalidate all accesses for a work
      const suffix = `:${options.workId}`;
      this.invalidateWhere(key => key.endsWith(suffix));
    }
  }

  /**
   * Invalidate cache when work is shared/unshared
   * Clears cache for all users who have (or had) access to this work
   */
  invalidateOnSharingChange(workId: number): void {
    this.invalidate({ workId });
  }

  /**
   * Invalidate cache when work is updated
   * Changes to work ownership or deletion should clear the cache
   */
  invalidateOnWorkChange(workId: number): void {
    this.invalidate({ workId });
  }
}

// Singleton instance
export const WorkAccessCache = new WorkAccessCacheImpl();
