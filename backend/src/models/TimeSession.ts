import { query } from '../config/database.js';
import { TimeSession } from '../types/index.js';

export class TimeSessionModel {
  static async findById(id: number, userId: number): Promise<TimeSession | null> {
    const result = await query<TimeSession>(
      'SELECT * FROM time_sessions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  static async findByIdWithAccess(id: number): Promise<TimeSession | null> {
    // Used when authorization is already checked by middleware
    const result = await query<TimeSession>(
      'SELECT * FROM time_sessions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  static async findByWorkId(workId: number, userId: number): Promise<TimeSession[]> {
    const result = await query<TimeSession>(
      `SELECT * FROM time_sessions
       WHERE work_id = $1 AND user_id = $2
       ORDER BY start_time DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  static async findByWorkIdWithAccess(workId: number): Promise<TimeSession[]> {
    // Used when authorization is already checked by middleware
    // Returns all sessions for the work regardless of user
    // Include username for session ownership display
    const result = await query<TimeSession>(
      `SELECT ts.*, u.username
       FROM time_sessions ts
       INNER JOIN users u ON ts.user_id = u.id
       WHERE ts.work_id = $1
       ORDER BY ts.start_time DESC`,
      [workId]
    );
    return result.rows;
  }

  static async findRunningSession(userId: number): Promise<TimeSession | null> {
    const result = await query<TimeSession>(
      'SELECT * FROM time_sessions WHERE user_id = $1 AND is_running = true LIMIT 1',
      [userId]
    );
    return result.rows[0] || null;
  }

  static async findRunningSessionForWork(workId: number, userId: number): Promise<TimeSession | null> {
    const result = await query<TimeSession>(
      'SELECT * FROM time_sessions WHERE work_id = $1 AND user_id = $2 AND is_running = true LIMIT 1',
      [workId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Find all running sessions across all works the user has access to
   * Used for user-level SSE stream to show "Active" indicators on dashboard
   */
  static async findAllRunningForUser(userId: number): Promise<TimeSession[]> {
    const result = await query<TimeSession>(
      `SELECT DISTINCT ts.*, u.username
       FROM time_sessions ts
       INNER JOIN work_access wa ON ts.work_id = wa.work_id
       INNER JOIN users u ON ts.user_id = u.id
       WHERE ts.is_running = true
         AND wa.user_id = $1
         AND wa.can_view = true
       ORDER BY ts.start_time DESC`,
      [userId]
    );
    return result.rows;
  }

  static async create(data: {
    workId: number;
    userId: number;
    startTime: Date;
  }): Promise<TimeSession> {
    const result = await query<TimeSession>(
      `INSERT INTO time_sessions (work_id, user_id, start_time, is_running)
       VALUES ($1, $2, $3, true)
       RETURNING *`,
      [data.workId, data.userId, data.startTime]
    );
    return result.rows[0];
  }

  static async stop(id: number, userId: number, endTime: Date): Promise<TimeSession> {
    const result = await query<TimeSession>(
      `UPDATE time_sessions
       SET end_time = $1,
           duration_ms = EXTRACT(EPOCH FROM ($1 - start_time)) * 1000,
           is_running = false
       WHERE id = $2 AND user_id = $3
       RETURNING *`,
      [endTime, id, userId]
    );
    return result.rows[0];
  }

  static async stopWithAccess(id: number, endTime: Date): Promise<TimeSession> {
    // Used when authorization is already checked by middleware
    const result = await query<TimeSession>(
      `UPDATE time_sessions
       SET end_time = $1,
           duration_ms = EXTRACT(EPOCH FROM ($1 - start_time)) * 1000,
           is_running = false
       WHERE id = $2
       RETURNING *`,
      [endTime, id]
    );
    return result.rows[0];
  }

  static async update(
    id: number,
    userId: number,
    data: { startTime?: Date; endTime?: Date; title?: string | null; color?: string | null }
  ): Promise<TimeSession> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.startTime !== undefined) {
      fields.push(`start_time = $${paramCount++}`);
      values.push(data.startTime);
    }
    if (data.endTime !== undefined) {
      fields.push(`end_time = $${paramCount++}`);
      values.push(data.endTime);
      fields.push(`duration_ms = EXTRACT(EPOCH FROM ($${paramCount - 1} - start_time)) * 1000`);
      fields.push(`is_running = false`);
    }
    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(data.color);
    }

    values.push(id, userId);

    const result = await query<TimeSession>(
      `UPDATE time_sessions
       SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async delete(id: number, userId: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM time_sessions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Update session without user filtering (for work-level permission checks)
   * SECURITY: Only use after verifying work-level canEdit permission
   */
  static async updateWithoutUserFilter(
    id: number,
    data: { startTime?: Date; endTime?: Date; title?: string | null; color?: string | null }
  ): Promise<TimeSession | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (data.startTime !== undefined) {
      fields.push(`start_time = $${paramCount++}`);
      values.push(data.startTime);
    }
    if (data.endTime !== undefined) {
      fields.push(`end_time = $${paramCount++}`);
      values.push(data.endTime);
      fields.push(`duration_ms = EXTRACT(EPOCH FROM ($${paramCount - 1} - start_time)) * 1000`);
      fields.push(`is_running = false`);
    }
    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(data.color);
    }

    if (fields.length === 0) {
      // No fields to update, return existing session
      return await this.findByIdWithAccess(id);
    }

    values.push(id);

    const result = await query<TimeSession>(
      `UPDATE time_sessions
       SET ${fields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete session without user filtering (for work-level permission checks)
   * SECURITY: Only use after verifying work-level canEdit permission
   */
  static async deleteWithoutUserFilter(id: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM time_sessions WHERE id = $1',
      [id]
    );
    return (result.rowCount ?? 0) > 0;
  }

  static async getTotalDuration(workId: number, userId: number): Promise<number> {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(duration_ms), 0) as total
       FROM time_sessions
       WHERE work_id = $1 AND user_id = $2 AND duration_ms IS NOT NULL`,
      [workId, userId]
    );
    return parseInt(result.rows[0]?.total || '0', 10);
  }

  static async getTotalDurationWithAccess(workId: number): Promise<number> {
    // Used when authorization is already checked by middleware
    // Returns total for all users' sessions on this work
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(duration_ms), 0) as total
       FROM time_sessions
       WHERE work_id = $1 AND duration_ms IS NOT NULL`,
      [workId]
    );
    return parseInt(result.rows[0]?.total || '0', 10);
  }

  static async getStatsByDateRange(
    userId: number,
    startDate: Date,
    endDate: Date
  ): Promise<{ work_id: number; total_duration: string }[]> {
    const result = await query<{ work_id: number; total_duration: string }>(
      `SELECT work_id, SUM(duration_ms) as total_duration
       FROM time_sessions
       WHERE user_id = $1
       AND start_time >= $2
       AND start_time <= $3
       AND duration_ms IS NOT NULL
       GROUP BY work_id`,
      [userId, startDate, endDate]
    );
    return result.rows;
  }
}
