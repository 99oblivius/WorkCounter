import { query } from '../config/database.js';
import { User, QueryParams } from '../types/index.js';
import { PasswordService } from '../services/passwordService.js';

export class UserModel {

  static async findById(id: number): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByUsername(username: string): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [username]
    );
    return result.rows[0] || null;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    return result.rows[0] || null;
  }

  static async findByUsernameOrEmail(usernameOrEmail: string): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = LOWER($1)',
      [usernameOrEmail]
    );
    return result.rows[0] || null;
  }


  static async update(id: number, data: Partial<Pick<User, 'email' | 'username'>>): Promise<User> {
    const fields: string[] = [];
    const values: QueryParams = [];
    let paramCount = 1;

    if (data.email !== undefined) {
      fields.push(`email = $${paramCount++}`);
      values.push(data.email);
    }
    if (data.username !== undefined) {
      fields.push(`username = $${paramCount++}`);
      values.push(data.username);
    }

    values.push(id);

    const result = await query<User>(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async getAll(): Promise<User[]> {
    const result = await query<User>(
      'SELECT * FROM users ORDER BY created_at DESC'
    );
    return result.rows;
  }

  static async setActive(id: number, isActive: boolean): Promise<User> {
    const result = await query<User>(
      'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING *',
      [isActive, id]
    );
    return result.rows[0];
  }

  static async updateLastLogin(id: number): Promise<void> {
    await query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1',
      [id]
    );
  }

  /**
   * Set user password (hashed)
   */
  static async setPassword(userId: number, password: string): Promise<void> {
    const passwordHash = await PasswordService.hashPassword(password);

    await query(
      `UPDATE users
       SET password_hash = $1,
           password_updated_at = CURRENT_TIMESTAMP,
           force_password_reset = false,
           failed_login_attempts = 0,
           locked_until = NULL
       WHERE id = $2`,
      [passwordHash, userId]
    );
  }

  /**
   * Verify user password
   */
  static async verifyPassword(userId: number, password: string): Promise<boolean> {
    const result = await query<{ password_hash: string }>(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (!result.rows[0]?.password_hash) {
      return false;
    }

    return PasswordService.verifyPassword(password, result.rows[0].password_hash);
  }

  /**
   * Record failed login attempt
   */
  static async recordFailedLogin(userId: number): Promise<void> {
    await query(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= 5
             THEN CURRENT_TIMESTAMP + INTERVAL '30 minutes'
             ELSE locked_until
           END
       WHERE id = $1`,
      [userId]
    );
  }

  /**
   * Reset failed login attempts
   */
  static async resetFailedLogins(userId: number): Promise<void> {
    await query(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1',
      [userId]
    );
  }

  /**
   * Check if user account is locked
   */
  static async isAccountLocked(userId: number): Promise<boolean> {
    const result = await query<{ locked_until: Date | null }>(
      'SELECT locked_until FROM users WHERE id = $1',
      [userId]
    );

    const lockedUntil = result.rows[0]?.locked_until;
    if (!lockedUntil) {
      return false;
    }

    return new Date(lockedUntil) > new Date();
  }
}
