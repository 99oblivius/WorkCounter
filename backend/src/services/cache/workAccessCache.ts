/**
 * Work Access Cache
 * Caches work access permissions for users
 */

interface WorkAccess {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isOwner: boolean;
  timestamp: number;
}

export class WorkAccessCache {
  private static cache = new Map<string, WorkAccess>();
  private static TTL = 2 * 60 * 1000; // 2 minutes

  /**
   * Generate cache key
   */
  private static key(userId: number, workId: number): string {
    return `${userId}:${workId}`;
  }

  /**
   * Get cached work access
   */
  static get(userId: number, workId: number): WorkAccess | null {
    const cached = this.cache.get(this.key(userId, workId));

    if (!cached) return null;

    // Check if expired
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(this.key(userId, workId));
      return null;
    }

    return cached;
  }

  /**
   * Set cached work access
   */
  static set(userId: number, workId: number, access: Omit<WorkAccess, 'timestamp'>): void {
    this.cache.set(this.key(userId, workId), {
      ...access,
      timestamp: Date.now()
    });
  }

  /**
   * Invalidate all cache entries for a specific work
   */
  static invalidateWork(workId: number): void {
    // Remove all cache entries for this work
    for (const [key] of this.cache) {
      if (key.endsWith(`:${workId}`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Invalidate all cache entries for a specific user
   */
  static invalidateUser(userId: number): void {
    // Remove all cache entries for this user
    for (const [key] of this.cache) {
      if (key.startsWith(`${userId}:`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached access
   */
  static clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      size: this.cache.size,
      ttl: this.TTL
    };
  }
}
