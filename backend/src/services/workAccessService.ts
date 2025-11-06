import { query } from '../config/database.js';
import { WorkAccessCache } from './cache/workAccessCache.js';

interface WorkAccessInfo {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isOwner: boolean;
  isShared: boolean;
}

export class WorkAccessService {
  /**
   * Check work access with caching
   */
  static async checkAccess(userId: number, workId: number): Promise<WorkAccessInfo> {
    // Check cache
    const cached = WorkAccessCache.get(userId, workId);
    if (cached) {
      return {
        ...cached,
        isShared: !cached.isOwner
      };
    }

    // Query database
    const result = await query<{
      is_owner: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }>(
      `SELECT
        is_owner,
        can_edit,
        can_delete
       FROM work_access
       WHERE work_id = $1 AND user_id = $2`,
      [workId, userId]
    );

    if (result.rows.length === 0) {
      const access = {
        canView: false,
        canEdit: false,
        canDelete: false,
        isOwner: false,
        isShared: false
      };
      return access;
    }

    const row = result.rows[0];
    const access = {
      canView: true,
      canEdit: row.can_edit,
      canDelete: row.can_delete,
      isOwner: row.is_owner,
      isShared: !row.is_owner
    };

    // Cache it
    WorkAccessCache.set(userId, workId, access);

    return access;
  }

  /**
   * Check if user owns a resource (session, timeline, file)
   */
  static async ownsResource(
    userId: number,
    resourceType: 'session' | 'timeline' | 'file',
    resourceId: number
  ): Promise<boolean> {
    const result = await query<{ owns: boolean }>(
      'SELECT user_owns_resource($1, $2, $3) as owns',
      [userId, resourceType, resourceId]
    );

    return result.rows[0]?.owns || false;
  }

  /**
   * Share work with user
   * ENHANCEMENT: Accept username or email
   */
  static async shareWork(
    workId: number,
    ownerUserId: number,
    sharedWithIdentifier: string, // username or email
    sharedByUserId: number,
    canEdit: boolean = false
  ): Promise<void> {
    // Get user ID from username OR email
    const userResult = await query<{ id: number; username: string }>(
      'SELECT id, username FROM users WHERE (username = $1 OR email = $1) AND is_active = true',
      [sharedWithIdentifier]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found or inactive');
    }

    const sharedWithUserId = userResult.rows[0].id;
    const sharedWithUsername = userResult.rows[0].username;

    // Verify work ownership
    const workResult = await query<{ user_id: number }>(
      'SELECT user_id FROM works WHERE id = $1',
      [workId]
    );

    if (workResult.rows.length === 0) {
      throw new Error('Work not found');
    }

    if (workResult.rows[0].user_id !== ownerUserId) {
      throw new Error('Not authorized to share this work');
    }

    // Share the work
    await query(
      `INSERT INTO work_shares (work_id, owner_id, shared_with_user_id, shared_by, can_edit)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (work_id, shared_with_user_id)
       DO UPDATE SET can_edit = EXCLUDED.can_edit, shared_by = EXCLUDED.shared_by, shared_at = CURRENT_TIMESTAMP`,
      [workId, ownerUserId, sharedWithUserId, sharedByUserId, canEdit]
    );

    // Invalidate cache
    WorkAccessCache.invalidateWork(workId);
  }

  /**
   * Unshare work
   * ENHANCEMENT: Accept username or email
   */
  static async unshareWork(
    workId: number,
    ownerUserId: number,
    sharedWithIdentifier: string // username or email
  ): Promise<void> {
    // Get user ID from username OR email
    const userResult = await query<{ id: number }>(
      'SELECT id FROM users WHERE username = $1 OR email = $1',
      [sharedWithIdentifier]
    );

    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const sharedWithUserId = userResult.rows[0].id;

    // Delete share
    const result = await query(
      'DELETE FROM work_shares WHERE work_id = $1 AND owner_id = $2 AND shared_with_user_id = $3 RETURNING id',
      [workId, ownerUserId, sharedWithUserId]
    );

    if (result.rows.length === 0) {
      throw new Error('Share not found or not authorized');
    }

    // Invalidate cache
    WorkAccessCache.invalidateWork(workId);
  }

  /**
   * Remove work from my shared works (as sharee)
   */
  static async removeFromMySharedWorks(workId: number, userId: number): Promise<void> {
    const result = await query(
      'DELETE FROM work_shares WHERE work_id = $1 AND shared_with_user_id = $2 RETURNING id',
      [workId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Share not found');
    }

    // Invalidate cache
    WorkAccessCache.invalidateUser(userId);
  }

  /**
   * Get users a work is shared with
   */
  static async getWorkShares(workId: number, ownerUserId: number): Promise<Array<{
    username: string;
    email: string;
    sharedAt: Date;
    canEdit: boolean;
  }>> {
    const result = await query<{
      username: string;
      email: string;
      shared_at: Date;
      can_edit: boolean;
    }>(
      `SELECT u.username, u.email, ws.shared_at, ws.can_edit
       FROM work_shares ws
       JOIN users u ON ws.shared_with_user_id = u.id
       WHERE ws.work_id = $1 AND ws.owner_id = $2
       ORDER BY ws.shared_at DESC`,
      [workId, ownerUserId]
    );

    return result.rows.map(row => ({
      username: row.username,
      email: row.email,
      sharedAt: row.shared_at,
      canEdit: row.can_edit
    }));
  }

  /**
   * Get all works shared with a user
   */
  static async getSharedWithUser(userId: number): Promise<Array<{
    id: number;
    title: string;
    description: string | null;
    client_name: string | null;
    hourly_rate: number | null;
    status: string;
    tags: string[] | null;
    ownerUsername: string;
    sharedAt: Date;
    canEdit: boolean;
    created_at: Date;
    updated_at: Date;
  }>> {
    const result = await query<{
      work_id: number;
      title: string;
      description: string | null;
      client_name: string | null;
      hourly_rate: number | null;
      status: string;
      tags: string[] | null;
      username: string;
      shared_at: Date;
      can_edit: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT ws.work_id, w.title, w.description, w.client_name, w.hourly_rate,
              w.status, w.tags, w.created_at, w.updated_at,
              u.username, ws.shared_at, ws.can_edit
       FROM work_shares ws
       JOIN works w ON ws.work_id = w.id
       JOIN users u ON ws.owner_id = u.id
       WHERE ws.shared_with_user_id = $1
       ORDER BY ws.shared_at DESC`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.work_id,
      title: row.title,
      description: row.description,
      client_name: row.client_name,
      hourly_rate: row.hourly_rate,
      status: row.status,
      tags: row.tags,
      ownerUsername: row.username,
      sharedAt: row.shared_at,
      canEdit: row.can_edit,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }
}
