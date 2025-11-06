import { query } from '../config/database.js';

export type WorkPermissionLevel = 'viewer' | 'editor' | 'manager';

interface WorkAccessInfo {
  permissionLevel: WorkPermissionLevel;
  isOwner: boolean;
  isShared: boolean;
  // Derived permissions (computed from level)
  canView: boolean;
  canCreate: boolean;
  canEditOthers: boolean;
  canDeleteOthers: boolean;
  // Legacy compatibility
  canEdit: boolean; // = canEditOthers
  canDelete: boolean; // = isOwner || canDeleteOthers
}

export class WorkAccessService {
  /**
   * Check work access permissions
   * Real-time updates handled by SSE + React Query cache on frontend
   */
  static async checkAccess(userId: number, workId: number): Promise<WorkAccessInfo> {
    // Query database
    const result = await query<{
      permission_level: WorkPermissionLevel;
      is_owner: boolean;
      can_view: boolean;
      can_create: boolean;
      can_edit_others: boolean;
      can_delete_others: boolean;
      can_edit: boolean;
      can_delete: boolean;
    }>(
      `SELECT
        permission_level,
        is_owner,
        can_view,
        can_create,
        can_edit_others,
        can_delete_others,
        can_edit,
        can_delete
       FROM work_access
       WHERE work_id = $1 AND user_id = $2`,
      [workId, userId]
    );

    if (result.rows.length === 0) {
      const access = {
        permissionLevel: 'viewer' as WorkPermissionLevel,
        canView: false,
        canCreate: false,
        canEditOthers: false,
        canDeleteOthers: false,
        isOwner: false,
        isShared: false,
        canEdit: false,
        canDelete: false
      };
      return access;
    }

    const row = result.rows[0];
    const access = {
      permissionLevel: row.permission_level,
      canView: row.can_view,
      canCreate: row.can_create,
      canEditOthers: row.can_edit_others,
      canDeleteOthers: row.can_delete_others,
      isOwner: row.is_owner,
      isShared: !row.is_owner,
      canEdit: row.can_edit,
      canDelete: row.can_delete
    };

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
   * Check if user can modify a resource (edit or delete)
   * Respects ownership (user always can modify their own) and work permissions
   */
  static async canModifyResource(
    userId: number,
    workId: number,
    resourceUserId: number,
    action: 'edit' | 'delete'
  ): Promise<boolean> {
    const result = await query<{ can_modify: boolean }>(
      'SELECT user_can_modify_resource($1, $2, $3, $4) as can_modify',
      [userId, workId, resourceUserId, action]
    );

    return result.rows[0]?.can_modify || false;
  }

  /**
   * Share work with user at specified permission level
   * ENHANCEMENT: Accept username or email
   */
  static async shareWork(
    workId: number,
    ownerUserId: number,
    sharedWithIdentifier: string, // username or email
    sharedByUserId: number,
    permissionLevel: WorkPermissionLevel = 'viewer'
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

    // Share the work with specified permission level
    // The trigger will automatically set the boolean columns for backwards compatibility
    await query(
      `INSERT INTO work_shares (
        work_id, owner_id, shared_with_user_id, shared_by, permission_level
      )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (work_id, shared_with_user_id)
       DO UPDATE SET
         permission_level = EXCLUDED.permission_level,
         shared_by = EXCLUDED.shared_by,
         shared_at = CURRENT_TIMESTAMP`,
      [workId, ownerUserId, sharedWithUserId, sharedByUserId, permissionLevel]
    );
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
  }

  /**
   * Get users a work is shared with
   */
  static async getWorkShares(workId: number, ownerUserId: number): Promise<Array<{
    username: string;
    email: string;
    sharedAt: Date;
    permissionLevel: WorkPermissionLevel;
    // Legacy (for backwards compatibility during transition)
    canEdit: boolean;
  }>> {
    const result = await query<{
      username: string;
      email: string;
      shared_at: Date;
      permission_level: WorkPermissionLevel;
      can_edit: boolean;
    }>(
      `SELECT u.username, u.email, ws.shared_at,
              ws.permission_level,
              -- Compute legacy canEdit field from permission_level for backwards compatibility
              (ws.permission_level = 'manager') as can_edit
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
      permissionLevel: row.permission_level,
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
    permissionLevel: WorkPermissionLevel;
    canEdit: boolean; // Legacy
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
      permission_level: WorkPermissionLevel;
      can_edit: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT ws.work_id, w.title, w.description, w.client_name, w.hourly_rate,
              w.status, w.tags, w.created_at, w.updated_at,
              u.username, ws.shared_at,
              ws.permission_level,
              -- Compute legacy canEdit field from permission_level for backwards compatibility
              (ws.permission_level = 'manager') as can_edit
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
      permissionLevel: row.permission_level,
      canEdit: row.can_edit,
      created_at: row.created_at,
      updated_at: row.updated_at
    }));
  }
}
