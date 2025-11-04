/**
 * Format bytes to human-readable string
 * Always shows the specified number of decimal places (default 1)
 */
export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0.0 B';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Keep as string to preserve trailing zeros (e.g., "2.0" instead of "2")
  return (bytes / Math.pow(k, i)).toFixed(dm) + ' ' + sizes[i];
}

/**
 * Format bytes per second to human-readable speed
 * Always shows 1 decimal place to prevent UI bouncing
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

/**
 * Sanitize filename for storage (used in metadata)
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
    .replace(/\s+/g, '_') // Replace spaces
    .replace(/_{2,}/g, '_') // Remove multiple underscores
    .substring(0, 200); // Limit length
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

/**
 * Format time in seconds to human-readable string
 */
export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
