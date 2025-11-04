import { FileStorageModel } from '../models/FileStorage.js';
import { minioService } from '../services/minioService.js';
import { tusServer } from '../services/tusService.js';

/**
 * Cleanup abandoned uploads
 * - Uploads created >24h ago still in 'uploading' status
 * - Orphaned MinIO objects
 * - Old tus metadata files
 *
 * Should be run as a cron job (e.g., daily at 3 AM)
 */
export async function cleanupAbandonedUploads() {
  console.log('[Cleanup] Starting abandoned upload cleanup...');

  try {
    // Find and mark abandoned uploads (created >24h ago, still 'uploading')
    const abandonedCount = await FileStorageModel.cleanupAbandoned();

    if (abandonedCount > 0) {
      console.log(`[Cleanup] Marked ${abandonedCount} abandoned uploads as cancelled`);
    } else {
      console.log('[Cleanup] No abandoned uploads found');
    }

    // TODO: Add cleanup for orphaned MinIO objects
    // This would require comparing MinIO objects with database records
    // and deleting objects that don't have corresponding active records

    // TODO: Add cleanup for old tus metadata files (if needed)
    // The S3Store should handle this automatically with expirationPeriodInMilliseconds
    // but we could add explicit cleanup here if needed

    console.log('[Cleanup] Abandoned upload cleanup completed');
  } catch (error) {
    console.error('[Cleanup] Error during abandoned upload cleanup:', error);
  }
}

/**
 * Start the cleanup scheduler
 * Runs cleanup every 6 hours
 */
export function startCleanupScheduler() {
  // Run immediately on startup
  cleanupAbandonedUploads();

  // Then run every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000;
  setInterval(cleanupAbandonedUploads, SIX_HOURS);

  console.log('[Cleanup] Scheduler started (runs every 6 hours)');
}
