/**
 * Settings Cache
 * Caches system settings with version-based invalidation
 *
 * REFACTORED: Now uses AbstractCache base class with additional versioning
 */

import { AbstractCache } from './AbstractCache.js';

interface VersionedSetting {
  value: any;
  version: number;
}

class SettingsCacheImpl extends AbstractCache<string, VersionedSetting> {
  private version = 1; // Increment on any setting change

  constructor() {
    super(60 * 1000); // 1 minute TTL
  }

  /**
   * Get cached setting value
   * Checks both TTL expiry and version invalidation
   */
  get<T>(key: string): T | null {
    const cached = this.getCached(key);

    if (!cached) return null;

    // Check version (invalidates if settings changed globally)
    if (cached.version !== this.version) {
      this.invalidateKey(key);
      return null;
    }

    return cached.value as T;
  }

  /**
   * Set cached setting value with current version
   */
  set<T>(key: string, value: T): void {
    this.setCached(key, {
      value,
      version: this.version
    });
  }

  /**
   * Invalidate all cached settings (when any setting changes)
   * Uses version bumping for efficient invalidation
   */
  invalidateAll(): void {
    this.version++;
    super.invalidateAll();
  }

  /**
   * Invalidate specific setting
   */
  invalidateKey(key: string): void {
    super.invalidateKey(key);
  }

  /**
   * Invalidate all settings in a category (e.g., "auth", "smtp")
   */
  invalidateCategory(category: string): void {
    const prefix = `${category}.`;
    this.invalidateWhere(key => key.startsWith(prefix));
  }

  /**
   * Get cache statistics including version info
   */
  getStats() {
    return {
      ...super.getStats(),
      version: this.version
    };
  }
}

// Singleton instance
export const SettingsCache = new SettingsCacheImpl();
