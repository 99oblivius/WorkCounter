/**
 * File upload and storage configuration
 * Centralized constants for file size limits and validation rules
 */

// Helper function defined first to avoid hoisting issues
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// File size limits (in bytes) - read from environment or use defaults
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE_BYTES || '5368709120', 10), // 5GB default
  MAX_IMAGE_SIZE: parseInt(process.env.MAX_IMAGE_SIZE_BYTES || '52428800', 10), // 50MB default
  MAX_NOTE_IMAGES: parseInt(process.env.MAX_NOTE_IMAGES || '3', 10),
} as const;

// Human-readable file size labels
export const FILE_SIZE_LABELS = {
  MAX_FILE_SIZE_LABEL: formatFileSize(FILE_SIZE_LIMITS.MAX_FILE_SIZE),
  MAX_IMAGE_SIZE_LABEL: formatFileSize(FILE_SIZE_LIMITS.MAX_IMAGE_SIZE),
} as const;

// Validation helpers
export const validateFileSize = (fileSize: number, maxSize: number = FILE_SIZE_LIMITS.MAX_FILE_SIZE): boolean => {
  return fileSize > 0 && fileSize <= maxSize;
};
