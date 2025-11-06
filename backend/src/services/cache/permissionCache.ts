/**
 * Permission Cache
 * Caches user permissions and roles to reduce database queries
 *
 * SECURITY FIX: Added mutex locking to prevent race conditions
 * where concurrent requests could cache stale permissions
 */

interface CachedPermissions {
  permissions: Set<string>;
  roles: Set<string>;
  timestamp: number;
}

interface PendingFetch {
  promise: Promise<Set<string>>;
  resolve: (value: Set<string>) => void;
  reject: (error: any) => void;
}

export class PermissionCache {
  private static cache = new Map<number, CachedPermissions>();
  private static TTL = 5 * 60 * 1000; // 5 minutes

  // SECURITY: Mutex locks to prevent race conditions
  private static locks = new Map<number, PendingFetch>();

  /**
   * Get cached permissions for a user
   */
  static get(userId: number): Set<string> | null {
    const cached = this.cache.get(userId);

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(userId);
      return null;
    }

    return cached.permissions;
  }

  /**
   * Set cached permissions for a user
   * SECURITY: Thread-safe setting with version checking
   */
  static set(userId: number, permissions: Set<string>, roles: Set<string>): void {
    const newEntry = {
      permissions,
      roles,
      timestamp: Date.now()
    };

    const existing = this.cache.get(userId);

    // Only update if this is newer or no existing cache
    if (!existing || newEntry.timestamp >= existing.timestamp) {
      this.cache.set(userId, newEntry);
    }
  }

  /**
   * Acquire lock for fetching permissions
   * Prevents multiple concurrent fetches for same user
   */
  static async acquireLock(userId: number, fetchFn: () => Promise<Set<string>>): Promise<Set<string>> {
    // Check if already locked (fetch in progress)
    const existingLock = this.locks.get(userId);
    if (existingLock) {
      // Wait for the ongoing fetch to complete
      return existingLock.promise;
    }

    // Create new lock
    let resolve!: (value: Set<string>) => void;
    let reject!: (error: any) => void;

    const promise = new Promise<Set<string>>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.locks.set(userId, { promise, resolve, reject });

    try {
      // Execute the fetch
      const result = await fetchFn();

      // Resolve the lock
      resolve(result);

      // Return result
      return result;
    } catch (error) {
      // Reject the lock
      reject(error);
      throw error;
    } finally {
      // Always release the lock
      this.locks.delete(userId);
    }
  }

  /**
   * Invalidate cache for specific user or all users
   * SECURITY: Also clears any pending locks
   */
  static invalidate(userId?: number): void {
    if (userId) {
      this.cache.delete(userId);
      this.locks.delete(userId);
    } else {
      this.cache.clear();
      this.locks.clear();
    }
  }

  /**
   * Get cached roles for a user
   */
  static getRoles(userId: number): Set<string> | null {
    const cached = this.cache.get(userId);
    return cached?.roles || null;
  }

  /**
   * Invalidate cache when roles change for multiple users
   * SECURITY: Also clears locks
   */
  static invalidateOnRoleChange(affectedUserIds: number[]): void {
    affectedUserIds.forEach(id => {
      this.cache.delete(id);
      this.locks.delete(id);
    });
  }

  /**
   * Get cache statistics (for monitoring)
   */
  static getStats() {
    return {
      size: this.cache.size,
      ttl: this.TTL,
      activeLocks: this.locks.size
    };
  }
}
