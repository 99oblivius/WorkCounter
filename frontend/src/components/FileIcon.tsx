import {
  FileText,
  FileImage,
  FileArchive,
  FileCode,
  FileVideo,
  FileAudio,
  File as FileIcon
} from 'lucide-react';

interface FileIconProps {
  filename: string;
  mimeType?: string | null;
  className?: string;
  size?: number;
}

/**
 * Simple file icon component using Lucide React icons
 * Maps file extensions and MIME types to appropriate icons
 */
export default function FileTypeIcon({
  filename,
  mimeType,
  className = '',
  size = 20
}: FileIconProps) {
  const extension = getFileExtension(filename);
  const Icon = getIconComponent(extension, mimeType);

  return <Icon size={size} className={className} />;
}

function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

function getIconComponent(extension: string, mimeType?: string | null) {
  // Check MIME type first
  if (mimeType) {
    if (mimeType.startsWith('image/')) return FileImage;
    if (mimeType.startsWith('video/')) return FileVideo;
    if (mimeType.startsWith('audio/')) return FileAudio;
  }

  // Documents
  if (['pdf', 'doc', 'docx', 'txt', 'rtf', 'md'].includes(extension)) {
    return FileText;
  }

  // Images
  if (['jpg', 'jpeg', 'png', 'gif', 'svg', 'webp', 'bmp', 'ico', 'psd', 'ai', 'sketch', 'fig'].includes(extension)) {
    return FileImage;
  }

  // Archives
  if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(extension)) {
    return FileArchive;
  }

  // Code/Development
  if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'go', 'rs', 'php', 'rb', 'swift', 'kt', 'html', 'css', 'scss', 'json', 'xml', 'yaml', 'yml', 'sh', 'bat'].includes(extension)) {
    return FileCode;
  }

  // Video
  if (['mp4', 'mov', 'avi', 'mkv', 'flv', 'wmv', 'webm', 'm4v'].includes(extension)) {
    return FileVideo;
  }

  // Audio
  if (['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'wma'].includes(extension)) {
    return FileAudio;
  }

  // Default
  return FileIcon;
}
