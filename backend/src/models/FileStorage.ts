import { query } from '../config/database.js';

export interface FileStorageRecord {
  id: number;
  work_id: number;
  user_id: number;
  filename: string;
  original_name: string;
  display_name: string;
  file_size: number;
  mime_type: string | null;
  file_extension: string | null;
  storage_key: string;
  tus_id: string | null;
  upload_status: 'uploading' | 'completed' | 'failed' | 'cancelled';
  upload_progress: number;
  uploaded_bytes: number;
  error_message: string | null;
  retry_count: number;
  uploaded_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class FileStorageModel {
  /**
   * Create a new file storage record (called when tus upload is initiated)
   */
  static async create(data: {
    workId: number;
    userId: number;
    filename: string;
    originalName: string;
    displayName: string;
    fileSize: number;
    mimeType: string | null;
    fileExtension: string | null;
    tusId: string | null;
    storageKey: string;
  }): Promise<FileStorageRecord> {
    const result = await query<FileStorageRecord>(
      `INSERT INTO file_storage
        (work_id, user_id, filename, original_name, display_name,
         file_size, mime_type, file_extension, storage_key, tus_id, upload_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        data.workId,
        data.userId,
        data.filename,
        data.originalName,
        data.displayName,
        data.fileSize,
        data.mimeType,
        data.fileExtension,
        data.storageKey,
        data.tusId,
        'uploading',
      ]
    );

    return result.rows[0];
  }

  /**
   * Update upload progress
   */
  static async updateProgress(
    fileId: number,
    uploadedBytes: number,
    progress: number
  ): Promise<void> {
    await query(
      `UPDATE file_storage
       SET uploaded_bytes = $2,
           upload_progress = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId, uploadedBytes, progress]
    );
  }

  /**
   * Mark file as completed
   */
  static async complete(fileId: number): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'completed',
           upload_progress = 100,
           uploaded_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId]
    );
  }

  /**
   * Mark file as failed
   */
  static async fail(fileId: number, errorMessage: string): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'failed',
           error_message = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId, errorMessage]
    );
  }

  /**
   * Mark file as cancelled
   */
  static async cancel(fileId: number): Promise<void> {
    await query(
      `UPDATE file_storage
       SET upload_status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [fileId]
    );
  }

  /**
   * Get all completed files for a work
   */
  static async findByWorkId(workId: number, userId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1 AND user_id = $2 AND upload_status = 'completed'
       ORDER BY uploaded_at DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  /**
   * Get all files for a work (including in-progress)
   */
  static async findAllByWorkId(workId: number, userId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1 AND user_id = $2
       ORDER BY created_at DESC`,
      [workId, userId]
    );
    return result.rows;
  }

  /**
   * Get all completed files for a work (when authorization is already checked)
   */
  static async findByWorkIdWithAccess(workId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1 AND upload_status = 'completed'
       ORDER BY uploaded_at DESC`,
      [workId]
    );
    return result.rows;
  }

  /**
   * Get all files for a work including in-progress (when authorization is already checked)
   */
  static async findAllByWorkIdWithAccess(workId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1
       ORDER BY created_at DESC`,
      [workId]
    );
    return result.rows;
  }

  /**
   * Get a single file by ID
   */
  static async findById(fileId: number, userId: number): Promise<FileStorageRecord | null> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get file by tus ID (for tus hooks)
   */
  static async findByTusId(tusId: string): Promise<FileStorageRecord | null> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE tus_id = $1`,
      [tusId]
    );
    return result.rows[0] || null;
  }

  /**
   * Delete a file
   */
  static async delete(fileId: number, userId: number): Promise<boolean> {
    const result = await query(
      `DELETE FROM file_storage
       WHERE id = $1 AND user_id = $2`,
      [fileId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all files for a work to delete (for cleanup)
   */
  static async findForWorkDeletion(workId: number, userId: number): Promise<FileStorageRecord[]> {
    const result = await query<FileStorageRecord>(
      `SELECT * FROM file_storage
       WHERE work_id = $1 AND user_id = $2`,
      [workId, userId]
    );
    return result.rows;
  }

  /**
   * Cleanup abandoned uploads (older than 24 hours, still uploading)
   */
  static async cleanupAbandoned(): Promise<number> {
    const result = await query<FileStorageRecord>(
      `UPDATE file_storage
       SET upload_status = 'cancelled',
           updated_at = CURRENT_TIMESTAMP
       WHERE upload_status = 'uploading'
       AND created_at < NOW() - INTERVAL '24 hours'
       RETURNING *`
    );
    return result.rows.length;
  }
}
