/**
 * Settings Cache
 * Caches system settings with version-based invalidation
 */

interface CachedSetting {
  value: any;
  timestamp: number;
  version: number;
}

export class SettingsCache {
  private static cache = new Map<string, CachedSetting>();
  private static TTL = 60 * 1000; // 1 minute
  private static version = 1; // Increment on any setting change

  /**
   * Get cached setting value
   */
  static get<T>(key: string): T | null {
    const cached = this.cache.get(key);

    if (!cached) return null;

    // Check version (invalidates all if settings changed)
    if (cached.version !== this.version) {
      this.cache.delete(key);
      return null;
    }

    // Check TTL
    if (Date.now() - cached.timestamp > this.TTL) {
      this.cache.delete(key);
      return null;
    }

    return cached.value as T;
  }

  /**
   * Set cached setting value
   */
  static set<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      version: this.version
    });
  }

  /**
   * Invalidate all cached settings (when any setting changes)
   */
  static invalidateAll(): void {
    this.version++;
    this.cache.clear();
  }

  /**
   * Invalidate specific setting
   */
  static invalidateKey(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Invalidate all settings in a category
   */
  static invalidateCategory(category: string): void {
    for (const [key] of this.cache) {
      if (key.startsWith(`${category}.`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      size: this.cache.size,
      version: this.version,
      ttl: this.TTL
    };
  }
}
