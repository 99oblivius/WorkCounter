import { PoolClient } from 'pg';
import { minioService } from './minioService.js';
import { unifiedSseService } from './unifiedSseService.js';
import { WorkAccessCache } from './cache/workAccessCache.js';
import { withTransaction } from '../config/database.js';

/**
 * Centralized service for resource deletion with file cleanup
 * Handles database operations, MinIO cleanup, and SSE notifications
 */
export class ResourceDeletionService {
  /**
   * Delete a work with all associated resources
   * Collects timeline images and file storage files before deletion
   */
  static async deleteWork(workId: number, userId: number): Promise<boolean> {
    // Execute database operations within a transaction for data integrity
    const { imageKeys, fileKeys, deleted } = await withTransaction(async (client) => {
      // Get all timeline entries for this work to collect image references
      const entriesResult = await client.query(
        'SELECT id, image_urls FROM timeline_entries WHERE work_id = $1',
        [workId]
      );

      // Collect all image keys from timeline entries
      const imageKeys: string[] = [];
      entriesResult.rows.forEach((entry: { id: number; image_urls?: string[] | null }) => {
        if (entry.image_urls && entry.image_urls.length > 0) {
          imageKeys.push(...entry.image_urls);
        }
      });

      // Get all file storage records for this work to collect file references
      const filesResult = await client.query(
        'SELECT id, storage_key, upload_status FROM file_storage WHERE work_id = $1',
        [workId]
      );

      // Collect storage keys from completed uploads
      const fileKeys: string[] = filesResult.rows
        .filter((f: any) => f.upload_status === 'completed')
        .map((f: any) => f.storage_key);

      // Delete the work (CASCADE will delete related sessions, timeline entries, and file_storage records)
      const deleteResult = await client.query(
        'DELETE FROM works WHERE id = $1 AND user_id = $2',
        [workId, userId]
      );

      const deleted = deleteResult.rowCount! > 0;

      if (!deleted) {
        throw new Error('Work not found');
      }

      return { imageKeys, fileKeys, deleted };
    });

    // Transaction committed successfully - now clean up external storage
    // (done outside transaction as MinIO operations cannot be rolled back)
    await this.cleanupMinIOFiles(imageKeys, 'timeline images', workId);
    await this.cleanupMinIOFiles(fileKeys, 'storage files', workId);

    // Invalidate work access cache for all users who had access to this work
    WorkAccessCache.invalidateOnSharingChange(workId);

    // Emit SSE event to owner's dashboard
    await unifiedSseService.emitToUser(userId, 'work:delete', { id: workId });

    return deleted;
  }

  /**
   * Delete a time session with all associated timeline entries and images
   * NOTE: This is deprecated - session deletion now happens in route handler with async cleanup
   */
  static async deleteSession(
    sessionId: number,
    workId: number,
    imageKeys: string[]
  ): Promise<boolean> {
    // Delete all images from MinIO
    await this.cleanupMinIOFiles(imageKeys, 'timeline images', sessionId);

    // Delete the session (cascade will delete timeline entries)
    // The deletion is already done by the caller, this just handles cleanup

    // Emit SSE event for real-time updates (include workId for frontend cache key)
    await unifiedSseService.emitToWork(workId, 'session:delete', { id: sessionId, workId });

    return true;
  }

  /**
   * Delete a timeline entry with associated images
   */
  static async deleteTimelineEntry(
    entryId: number,
    workId: number,
    userId: number
  ): Promise<{ imageUrls: string[] }> {
    // Execute database operations within a transaction for data integrity
    const { imageUrls } = await withTransaction(async (client) => {
      // Get entry to collect image references
      const entryResult = await client.query(
        'SELECT id, image_urls FROM timeline_entries WHERE id = $1',
        [entryId]
      );

      if (entryResult.rows.length === 0) {
        throw new Error('Timeline entry not found');
      }

      const entry = entryResult.rows[0];

      // Collect image URLs before deletion
      const imageUrls = entry.image_urls || [];

      // Delete timeline entry from database
      const deleteResult = await client.query(
        'DELETE FROM timeline_entries WHERE id = $1',
        [entryId]
      );

      if (deleteResult.rowCount === 0) {
        throw new Error('Timeline entry not found');
      }

      return { imageUrls };
    });

    // Transaction committed successfully - now clean up external storage
    await this.cleanupMinIOFiles(imageUrls, 'timeline images', entryId);

    // Emit SSE event for real-time updates (include workId for frontend cache key)
    await unifiedSseService.emitToWork(workId, 'timeline:delete', { id: entryId, workId });

    return { imageUrls };
  }

  /**
   * Helper method to clean up files from MinIO with proper error handling
   */
  private static async cleanupMinIOFiles(
    keys: string[],
    resourceType: string,
    resourceId: number
  ): Promise<void> {
    if (keys.length > 0) {
      try {
        await minioService.deleteFiles(keys);
      } catch (minioError) {
        // Log but don't fail - database is already committed
        console.error(`[MinIO Cleanup] Failed to delete ${keys.length} ${resourceType} for resource ${resourceId}:`, minioError);
      }
    }
  }

  /**
   * Collect image keys from timeline entries
   * Useful when you need to collect images before deletion
   */
  static async collectTimelineImages(sessionId: number): Promise<string[]> {
    const { TimelineEntryModel } = await import('../models/TimelineEntry.js');

    const entries = await TimelineEntryModel.findBySessionIdWithAccess(sessionId);

    const imageKeys: string[] = [];
    entries.forEach(entry => {
      if (entry.image_urls && entry.image_urls.length > 0) {
        imageKeys.push(...entry.image_urls);
      }
    });

    return imageKeys;
  }
}
