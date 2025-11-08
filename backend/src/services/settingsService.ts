import { query } from '../config/database.js';
import { SettingsCache } from './cache/settingsCache.js';
import { AuditService } from './auditService.js';

interface Setting {
  id: number;
  key: string;
  value: string;
  valueType: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description?: string;
  isPublic: boolean;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string;
}

export class SettingsService {
  /**
   * Get setting with type conversion and caching
   */
  static async get<T = any>(key: string, defaultValue?: T): Promise<T> {
    // Check cache
    const cached = SettingsCache.get<T>(key);
    if (cached !== null) return cached;

    try {
      const result = await query<Setting>(
        'SELECT * FROM system_settings WHERE key = $1',
        [key]
      );

      if (result.rows.length === 0) {
        // Fallback to environment variable
        const envKey = key.toUpperCase().replace(/\./g, '_');
        const envValue = process.env[envKey];

        if (envValue !== undefined) {
          const parsed = this.parseValue(envValue, 'string') as T;
          SettingsCache.set(key, parsed);
          return parsed;
        }

        return defaultValue as T;
      }

      const setting = result.rows[0];
      const value = this.parseValue(setting.value, setting.valueType);

      // Cache it
      SettingsCache.set(key, value);

      return value as T;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return defaultValue as T;
    }
  }

  /**
   * Get multiple settings by category
   */
  static async getByCategory(category: string): Promise<Record<string, any>> {
    const result = await query<Setting>(
      'SELECT * FROM system_settings WHERE category = $1 ORDER BY key',
      [category]
    );

    const settings: Record<string, any> = {};
    for (const setting of result.rows) {
      const value = this.parseValue(setting.value, setting.valueType);
      settings[setting.key] = value;
      SettingsCache.set(setting.key, value);
    }

    return settings;
  }

  /**
   * Get all settings (for admin panel)
   */
  static async getAllSettings(): Promise<Setting[]> {
    const result = await query<{
      id: number;
      key: string;
      value: string;
      value_type: string;
      category: string;
      description: string;
      is_public: boolean;
      default_value: string;
      min_value: number;
      max_value: number;
    }>('SELECT * FROM system_settings ORDER BY category, key');

    return result.rows.map(row => ({
      id: row.id,
      key: row.key,
      value: row.value,
      valueType: row.value_type as 'string' | 'number' | 'boolean' | 'json',
      category: row.category,
      description: row.description,
      isPublic: row.is_public,
      minValue: row.min_value,
      maxValue: row.max_value,
      defaultValue: row.default_value
    }));
  }

  /**
   * Get all public settings (for frontend)
   */
  static async getPublicSettings(): Promise<Record<string, any>> {
    const result = await query<Setting>(
      'SELECT key, value, value_type FROM system_settings WHERE is_public = true'
    );

    const settings: Record<string, any> = {};
    for (const setting of result.rows) {
      settings[setting.key] = this.parseValue(setting.value, setting.valueType);
    }

    return settings;
  }

  /**
   * Update setting with validation
   */
  static async set(
    key: string,
    value: any,
    userId: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    // Get setting definition
    const settingResult = await query<Setting>(
      'SELECT * FROM system_settings WHERE key = $1',
      [key]
    );

    if (settingResult.rows.length === 0) {
      throw new Error('Setting not found');
    }

    const setting = settingResult.rows[0];

    // Validate number ranges
    if (setting.valueType === 'number') {
      const numValue = typeof value === 'number' ? value : parseFloat(value);

      if (isNaN(numValue)) {
        throw new Error('Invalid number value');
      }

      if (setting.minValue !== undefined && setting.minValue !== null && numValue < setting.minValue) {
        throw new Error(`Value must be at least ${setting.minValue}`);
      }

      if (setting.maxValue !== undefined && setting.maxValue !== null && numValue > setting.maxValue) {
        throw new Error(`Value cannot exceed ${setting.maxValue}`);
      }
    }

    const oldValue = setting.value;
    // Convert value to string based on type
    let stringValue: string;
    if (typeof value === 'string') {
      stringValue = value;
    } else if (typeof value === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (typeof value === 'number') {
      stringValue = value.toString();
    } else {
      stringValue = JSON.stringify(value);
    }

    // Update setting
    await query(
      `UPDATE system_settings
       SET value = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2
       WHERE key = $3`,
      [stringValue, userId, key]
    );

    // Record in history
    await query(
      `INSERT INTO settings_history (setting_id, old_value, new_value, changed_by, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [setting.id, oldValue, stringValue, userId, ipAddress, userAgent]
    );

    // Audit log
    await AuditService.log({
      userId,
      action: 'setting.updated',
      resourceType: 'setting',
      resourceId: setting.id,
      details: { key, oldValue, newValue: value },
      ipAddress,
      userAgent
    });

    // Invalidate cache
    SettingsCache.invalidateAll();
  }

  /**
   * Parse value based on type
   */
  private static parseValue(value: string, type: string): any {
    switch (type) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value === 'true' || value === '1';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  /**
   * Get settings history
   */
  static async getHistory(settingId: number, limit: number = 20) {
    const result = await query(
      `SELECT sh.*, u.username
       FROM settings_history sh
       LEFT JOIN users u ON sh.changed_by = u.id
       WHERE sh.setting_id = $1
       ORDER BY sh.changed_at DESC
       LIMIT $2`,
      [settingId, limit]
    );

    return result.rows;
  }
}
