import { query } from '../config/database.js';
import { Work } from '../types/index.js';

export class WorkModel {
  static async findById(id: number, userId: number): Promise<Work | null> {
    const result = await query<Work>(
      'SELECT * FROM works WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async findByIdWithAccess(id: number): Promise<Work | null> {
    // Used when authorization is already checked by middleware
    const result = await query<Work>(
      'SELECT * FROM works WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByUserId(userId: number, status?: string): Promise<Work[]> {
    let sql = 'SELECT * FROM works WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      sql += ' AND status = $2';
      params.push(status);
    }

    sql += ' ORDER BY updated_at DESC';

    const result = await query<Work>(sql, params);
    return result.rows;
  }

  static async create(data: {
    userId: number;
    title: string;
    description?: string;
    clientName?: string;
    hourlyRate?: number;
    tags?: string[];
  }): Promise<Work> {
    const result = await query<Work>(
      `INSERT INTO works (user_id, title, description, client_name, hourly_rate, tags)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.userId,
        data.title,
        data.description || null,
        data.clientName || null,
        data.hourlyRate || null,
        data.tags || null,
      ]
    );
    return result.rows[0];
  }

  static async update(
    id: number,
    userId: number,
    data: Partial<Omit<Work, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  ): Promise<Work> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(data.description);
    }
    if (data.client_name !== undefined) {
      fields.push(`client_name = $${paramCount++}`);
      values.push(data.client_name);
    }
    if (data.hourly_rate !== undefined) {
      fields.push(`hourly_rate = $${paramCount++}`);
      values.push(data.hourly_rate);
    }
    if (data.status !== undefined) {
      fields.push(`status = $${paramCount++}`);
      values.push(data.status);
    }
    if (data.tags !== undefined) {
      fields.push(`tags = $${paramCount++}`);
      values.push(data.tags);
    }

    values.push(id, userId);

    const result = await query<Work>(
      `UPDATE works SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM works WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async search(userId: number, searchTerm: string): Promise<Work[]> {
    // SECURITY: Validate and sanitize search input
    if (!searchTerm || typeof searchTerm !== 'string') {
      return [];
    }

    // Trim and limit length to prevent abuse
    const sanitizedTerm = searchTerm.trim().substring(0, 200);

    if (sanitizedTerm.length === 0) {
      return [];
    }

    // SECURITY: Escape LIKE wildcards to prevent SQL injection via LIKE patterns
    // Replace % and _ with escaped versions since these are special LIKE characters
    const escapedForLike = sanitizedTerm
      .replace(/\\/g, '\\\\')  // Escape backslash first
      .replace(/%/g, '\\%')    // Escape % wildcard
      .replace(/_/g, '\\_');   // Escape _ wildcard

    // Use parameterized query with escaped search term
    const result = await query<Work>(
      `SELECT * FROM works
       WHERE user_id = $1
       AND (
         title ILIKE $2 ESCAPE '\\'
         OR description ILIKE $2 ESCAPE '\\'
         OR client_name ILIKE $2 ESCAPE '\\'
         OR $3 = ANY(tags)
       )
       ORDER BY updated_at DESC`,
      [userId, `%${escapedForLike}%`, sanitizedTerm]
    );
    return result.rows;
  }
}
