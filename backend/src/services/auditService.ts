import { query } from '../config/database.js';

interface AuditLogEntry {
  userId?: number;
  username?: string;
  action: string;
  resourceType?: string;
  resourceId?: number;
  details?: any;
  ipAddress?: string;
  userAgent?: string;
  status?: 'success' | 'failure' | 'warning';
}

export class AuditService {
  /**
   * Log an action to audit trail
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await query(
        `INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details, ip_address, user_agent, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          entry.userId || null,
          entry.username || null,
          entry.action,
          entry.resourceType || null,
          entry.resourceId || null,
          entry.details ? JSON.stringify(entry.details) : null,
          entry.ipAddress || null,
          entry.userAgent || null,
          entry.status || 'success'
        ]
      );
    } catch (error) {
      console.error('Error creating audit log:', error);
      // Don't throw - audit logging should not break application flow
    }
  }

  /**
   * Get audit logs with filtering and pagination
   */
  static async getLogs(filters: {
    userId?: number;
    action?: string;
    resourceType?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }) {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (filters.userId) {
      conditions.push(`user_id = $${paramCount++}`);
      values.push(filters.userId);
    }

    if (filters.action) {
      conditions.push(`action = $${paramCount++}`);
      values.push(filters.action);
    }

    if (filters.resourceType) {
      conditions.push(`resource_type = $${paramCount++}`);
      values.push(filters.resourceType);
    }

    if (filters.status) {
      conditions.push(`status = $${paramCount++}`);
      values.push(filters.status);
    }

    if (filters.startDate) {
      conditions.push(`created_at >= $${paramCount++}`);
      values.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`created_at <= $${paramCount++}`);
      values.push(filters.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const result = await query(
      `SELECT id, user_id, username, action, resource_type, resource_id,
              details, user_agent, status, created_at
       FROM audit_logs ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramCount++} OFFSET $${paramCount}`,
      [...values, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get action statistics
   */
  static async getStats(days: number = 30) {
    // Validate input to prevent abuse
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw new Error('Days must be an integer between 1 and 3650');
    }

    const result = await query(
      `SELECT
         action,
         COUNT(*) as count,
         COUNT(DISTINCT user_id) as unique_users
       FROM audit_logs
       WHERE created_at >= NOW() - INTERVAL '1 days' * $1
       GROUP BY action
       ORDER BY count DESC
       LIMIT 20`,
      [days]
    );

    return result.rows;
  }

  /**
   * Get recent activity for a user
   */
  static async getUserActivity(userId: number, limit: number = 20) {
    const result = await query(
      `SELECT action, resource_type, resource_id, created_at, details
       FROM audit_logs
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  }
}
