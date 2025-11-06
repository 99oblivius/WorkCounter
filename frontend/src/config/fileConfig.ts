/**
 * File upload and storage configuration
 * Centralized constants for file size limits, validation rules, and user messages
 */

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 5 * 1024 * 1024 * 1024, // 5GB
  MAX_IMAGE_SIZE: 50 * 1024 * 1024, // 50MB for images
  MAX_NOTE_IMAGES: 9, // Maximum number of images per note/timeline entry
} as const;

// Human-readable file size labels
export const FILE_SIZE_LABELS = {
  MAX_FILE_SIZE_LABEL: '5GB',
  MAX_IMAGE_SIZE_LABEL: '50MB',
} as const;

// User-facing messages
export const FILE_MESSAGES = {
  // Error messages
  FILE_EMPTY: (fileName: string) =>
    `File "${fileName}" is empty (0 bytes). Folders cannot be uploaded directly - please use a zip file.`,
  FILE_EXCEEDS_LIMIT: (fileName: string, limit: string = FILE_SIZE_LABELS.MAX_FILE_SIZE_LABEL) =>
    `File "${fileName}" exceeds ${limit} limit`,
  IMAGE_NOT_IMAGE: (fileName: string) =>
    `${fileName} is not an image file`,
  IMAGE_EXCEEDS_LIMIT: (fileName: string, limit: string = FILE_SIZE_LABELS.MAX_IMAGE_SIZE_LABEL) =>
    `${fileName} exceeds ${limit} limit`,
  MAX_IMAGES_REACHED: (max: number = FILE_SIZE_LIMITS.MAX_NOTE_IMAGES) =>
    `Maximum ${max} images allowed`,

  // Folder/zip messages
  FOLDER_NOT_SUPPORTED: 'Folder upload not supported in this browser. Please zip the folder manually or use a modern browser.',
  NO_VALID_FILES: 'No valid files found to upload.',
  FAILED_TO_ZIP: 'Failed to create zip file',
  FAILED_TO_PROCESS_DROP: 'Failed to process dropped files/folders. Please try again.',
  CANNOT_ZIP_EMPTY: 'Cannot zip empty folder',

  // Download messages
  FAILED_TO_DOWNLOAD: 'Failed to download file',

  // Generic messages
  FAILED_TO_SAVE: 'Failed to save. Please try again.',
  FAILED_TO_DELETE: 'Failed to delete. Please try again.',

  // Upload messages
  UPLOAD_FAILED: 'Upload failed',
  UPLOAD_CANCELLED: 'Upload cancelled',
} as const;

// Console logging prefixes
export const LOG_PREFIXES = {
  FOLDER_ZIP: '[Folder Zip]',
  UPLOAD: '[Upload]',
  DROP: '[Drop]',
} as const;

// Validation helpers
export const validateFileSize = (fileSize: number, maxSize: number = FILE_SIZE_LIMITS.MAX_FILE_SIZE): boolean => {
  return fileSize > 0 && fileSize <= maxSize;
};

export const validateImageFile = (file: File, maxImageSize?: number): { valid: boolean; error?: string } => {
  if (!file.type.startsWith('image/')) {
    return { valid: false, error: FILE_MESSAGES.IMAGE_NOT_IMAGE(file.name) };
  }

  const limit = maxImageSize || FILE_SIZE_LIMITS.MAX_IMAGE_SIZE;
  if (file.size > limit) {
    const limitLabel = formatFileSize(limit);
    return { valid: false, error: FILE_MESSAGES.IMAGE_EXCEEDS_LIMIT(file.name, limitLabel) };
  }

  return { valid: true };
};

export const validateRegularFile = (file: File, maxFileSize?: number): { valid: boolean; error?: string } => {
  if (file.size === 0) {
    return { valid: false, error: FILE_MESSAGES.FILE_EMPTY(file.name) };
  }

  const limit = maxFileSize || FILE_SIZE_LIMITS.MAX_FILE_SIZE;
  if (file.size > limit) {
    const limitLabel = formatFileSize(limit);
    return { valid: false, error: FILE_MESSAGES.FILE_EXCEEDS_LIMIT(file.name, limitLabel) };
  }

  return { valid: true };
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};
