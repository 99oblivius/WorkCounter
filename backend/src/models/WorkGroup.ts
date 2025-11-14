import { query, withTransaction } from '../config/database.js';
import { WorkGroup, QueryParams } from '../types/index.js';

export class WorkGroupModel {
  /**
   * Find all work groups for a user, ordered by display_order
   */
  static async findByUserId(userId: number): Promise<WorkGroup[]> {
    const result = await query<WorkGroup>(
      'SELECT * FROM work_groups WHERE user_id = $1 ORDER BY display_order ASC, created_at ASC',
      [userId]
    );
    return result.rows;
  }

  /**
   * Find a work group by ID, ensuring it belongs to the user
   */
  static async findById(id: number, userId: number): Promise<WorkGroup | null> {
    const result = await query<WorkGroup>(
      'SELECT * FROM work_groups WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new work group
   */
  static async create(userId: number, title: string): Promise<WorkGroup> {
    // Get the next display_order (highest + 1)
    const maxOrderResult = await query<{ max: number | null }>(
      'SELECT MAX(display_order) as max FROM work_groups WHERE user_id = $1',
      [userId]
    );
    const nextOrder = (maxOrderResult.rows[0]?.max ?? -1) + 1;

    const result = await query<WorkGroup>(
      `INSERT INTO work_groups (user_id, title, display_order)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, title, nextOrder]
    );
    return result.rows[0];
  }

  /**
   * Update a work group's title or display order
   */
  static async update(
    id: number,
    userId: number,
    data: { title?: string; displayOrder?: number }
  ): Promise<WorkGroup | null> {
    const fields: string[] = [];
    const values: QueryParams = [];
    let paramCount = 1;

    if (data.title !== undefined) {
      fields.push(`title = $${paramCount++}`);
      values.push(data.title);
    }
    if (data.displayOrder !== undefined) {
      fields.push(`display_order = $${paramCount++}`);
      values.push(data.displayOrder);
    }

    if (fields.length === 0) {
      return this.findById(id, userId);
    }

    values.push(id, userId);

    const result = await query<WorkGroup>(
      `UPDATE work_groups SET ${fields.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  /**
   * Delete a work group (works become ungrouped via ON DELETE SET NULL)
   */
  static async delete(id: number, userId: number): Promise<boolean> {
    const result = await query(
      'DELETE FROM work_groups WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Batch update display orders for drag-and-drop reordering (atomically)
   */
  static async reorder(userId: number, groupOrders: { id: number; displayOrder: number }[]): Promise<void> {
    return await withTransaction(async (client) => {
      for (const { id, displayOrder } of groupOrders) {
        await client.query(
          'UPDATE work_groups SET display_order = $1 WHERE id = $2 AND user_id = $3',
          [displayOrder, id, userId]
        );
      }
    });
  }
}
