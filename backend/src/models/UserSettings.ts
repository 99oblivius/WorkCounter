import { query } from '../config/database.js';

interface UserSetting {
  id: number;
  user_id: number;
  setting_key: string;
  setting_value: string;
  created_at: Date;
  updated_at: Date;
}

export class UserSettingsModel {
  /**
   * Get a single setting value for a user
   */
  static async get(userId: number, key: string): Promise<string | null> {
    const result = await query<UserSetting>(
      'SELECT setting_value FROM user_settings WHERE user_id = $1 AND setting_key = $2',
      [userId, key]
    );

    return result.rows.length > 0 ? result.rows[0].setting_value : null;
  }

  /**
   * Get all settings for a user as a key-value object
   */
  static async getAll(userId: number): Promise<Record<string, string>> {
    const result = await query<UserSetting>(
      'SELECT setting_key, setting_value FROM user_settings WHERE user_id = $1',
      [userId]
    );

    const settings: Record<string, string> = {};
    for (const row of result.rows) {
      settings[row.setting_key] = row.setting_value;
    }

    return settings;
  }

  /**
   * Set a single setting value for a user (insert or update)
   */
  static async set(userId: number, key: string, value: string): Promise<void> {
    await query(
      `INSERT INTO user_settings (user_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, setting_key)
       DO UPDATE SET setting_value = $3, updated_at = CURRENT_TIMESTAMP`,
      [userId, key, value]
    );
  }

  /**
   * Set multiple settings for a user at once
   */
  static async setMultiple(userId: number, settings: Record<string, string>): Promise<void> {
    const client = await query('BEGIN', []);

    try {
      for (const [key, value] of Object.entries(settings)) {
        await this.set(userId, key, value);
      }
      await query('COMMIT', []);
    } catch (error) {
      await query('ROLLBACK', []);
      throw error;
    }
  }

  /**
   * Delete a setting for a user
   */
  static async delete(userId: number, key: string): Promise<void> {
    await query(
      'DELETE FROM user_settings WHERE user_id = $1 AND setting_key = $2',
      [userId, key]
    );
  }

  /**
   * Delete all settings for a user
   */
  static async deleteAll(userId: number): Promise<void> {
    await query(
      'DELETE FROM user_settings WHERE user_id = $1',
      [userId]
    );
  }
}
