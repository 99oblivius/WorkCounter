import { query } from '../config/database.js';
import { User } from '../types/index.js';

export class UserModel {
  static async findByAuthentikId(authentikId: string): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE authentik_id = $1',
      [authentikId]
    );
    return result.rows[0] || null;
  }

  static async findById(id: number): Promise<User | null> {
    const result = await query<User>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async create(data: {
    authentikId: string;
    email: string;
    username: string;
  }): Promise<User> {
    const result = await query<User>(
      `INSERT INTO users (authentik_id, email, username)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.authentikId, data.email, data.username]
    );
    return result.rows[0];
  }

  static async update(id: number, data: Partial<Pick<User, 'email' | 'username'>>): Promise<User> {
    const fields: string[] = [];
    const values: any[] = [];
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
}
