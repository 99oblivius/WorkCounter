import { query } from '../config/database.js';
import { TimelineEntry } from '../types/index.js';

export class TimelineEntryModel {
  static async findById(id: number, userId: number): Promise<TimelineEntry | null> {
    const result = await query<TimelineEntry>(
      'SELECT * FROM timeline_entries WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async findByIdWithAccess(id: number): Promise<TimelineEntry | null> {
    // Used when authorization is already checked by middleware
    const result = await query<TimelineEntry>(
      'SELECT * FROM timeline_entries WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findBySessionId(sessionId: number, userId: number): Promise<TimelineEntry[]> {
    const result = await query<TimelineEntry>(
      `SELECT * FROM timeline_entries
       WHERE time_session_id = $1 AND user_id = $2
       ORDER BY timestamp ASC`,
      [sessionId, userId]
    );
    return result.rows;
  }

  static async findBySessionIdWithAccess(sessionId: number): Promise<TimelineEntry[]> {
    // Used when authorization is already checked by middleware
    const result = await query<TimelineEntry>(
      `SELECT * FROM timeline_entries
       WHERE time_session_id = $1
       ORDER BY timestamp ASC`,
      [sessionId]
    );
    return result.rows;
  }

  static async findByWorkId(workId: number, userId: number): Promise<TimelineEntry[]> {
    const result = await query<TimelineEntry>(
      `SELECT * FROM timeline_entries
       WHERE work_id = $1 AND user_id = $2
       ORDER BY timestamp DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  static async findByWorkIdWithAccess(workId: number): Promise<TimelineEntry[]> {
    // Used when authorization is already checked by middleware
    // Returns all timeline entries for the work regardless of user
    const result = await query<TimelineEntry>(
      `SELECT * FROM timeline_entries
       WHERE work_id = $1
       ORDER BY timestamp DESC`,
      [workId]
    );
    return result.rows;
  }

  static async create(data: {
    timeSessionId: number;
    workId: number;
    userId: number;
    timestamp: Date;
    label?: string;
    activityType?: string;
    imageUrls?: string[];
  }): Promise<TimelineEntry> {
    const result = await query<TimelineEntry>(
      `INSERT INTO timeline_entries (time_session_id, work_id, user_id, timestamp, label, activity_type, image_urls)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.timeSessionId,
        data.workId,
        data.userId,
        data.timestamp,
        data.label || null,
        data.activityType || null,
        data.imageUrls || null,
      ]
    );
    return result.rows[0];
  }

  static async update(
    id: number,
    userId: number,
    data: Partial<Pick<TimelineEntry, 'timestamp' | 'label'>> & { activity_type?: string | null; image_urls?: string[] | null }
  ): Promise<TimelineEntry> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.timestamp !== undefined) {
      fields.push(`timestamp = $${paramCount++}`);
      values.push(data.timestamp);
    }
    if (data.label !== undefined) {
      fields.push(`label = $${paramCount++}`);
      values.push(data.label);
    }
    if (data.activity_type !== undefined) {
      fields.push(`activity_type = $${paramCount++}`);
      values.push(data.activity_type);
    }
    if (data.image_urls !== undefined) {
      fields.push(`image_urls = $${paramCount++}`);
      values.push(data.image_urls);
    }

    values.push(id, userId);

    const result = await query<TimelineEntry>(
      `UPDATE timeline_entries
       SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM timeline_entries WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update timeline entry without user filtering (for work-level permission checks)
   * SECURITY: Only use after verifying work-level canEdit permission
   */
  static async updateWithoutUserFilter(
    id: number,
    data: Partial<Pick<TimelineEntry, 'timestamp' | 'label'>> & { activity_type?: string | null; image_urls?: string[] | null }
  ): Promise<TimelineEntry | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.timestamp !== undefined) {
      fields.push(`timestamp = $${paramCount++}`);
      values.push(data.timestamp);
    }
    if (data.label !== undefined) {
      fields.push(`label = $${paramCount++}`);
      values.push(data.label);
    }
    if (data.activity_type !== undefined) {
      fields.push(`activity_type = $${paramCount++}`);
      values.push(data.activity_type);
    }
    if (data.image_urls !== undefined) {
      fields.push(`image_urls = $${paramCount++}`);
      values.push(data.image_urls);
    }

    if (fields.length === 0) {
      // No fields to update, fetch and return existing entry
      const result = await query<TimelineEntry>(
        'SELECT * FROM timeline_entries WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    }

    values.push(id);

    const result = await query<TimelineEntry>(
      `UPDATE timeline_entries
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete timeline entry without user filtering (for work-level permission checks)
   * SECURITY: Only use after verifying work-level canEdit permission
   */
  static async deleteWithoutUserFilter(id: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM timeline_entries WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async getByActivityType(
    workId: number,
    userId: number,
    activityType: string
  ): Promise<TimelineEntry[]> {
    const result = await query<TimelineEntry>(
      `SELECT * FROM timeline_entries
       WHERE work_id = $1 AND user_id = $2 AND activity_type = $3
       ORDER BY timestamp DESC`,
      [workId, userId, activityType]
    );
    return result.rows;
  }
}
