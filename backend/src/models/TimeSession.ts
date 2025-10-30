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

  static async findByWorkId(workId: number, userId: number): Promise<TimeSession[]> {
    const result = await query<TimeSession>(
      `SELECT * FROM time_sessions
       WHERE work_id = $1 AND user_id = $2
       ORDER BY start_time DESC`,
      [workId, userId]
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

  static async update(
    id: number,
    userId: number,
    data: { startTime?: Date; endTime?: Date }
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

  static async getTotalDuration(workId: number, userId: number): Promise<number> {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(duration_ms), 0) as total
       FROM time_sessions
       WHERE work_id = $1 AND user_id = $2 AND duration_ms IS NOT NULL`,
      [workId, userId]
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
