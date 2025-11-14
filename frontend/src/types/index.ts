export interface User {
  userId: number;
  email: string;
  username: string;
}

export interface Work {
  id: number;
  user_id: number;
  title: string;
  description?: string;
  client_name?: string;
  hourly_rate?: number;
  status: 'active' | 'archived' | 'completed';
  tags?: string[];
  group_id?: number | null;
  created_at: string;
  updated_at: string;
}

export interface WorkGroup {
  id: number;
  user_id: number;
  title: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface TimeSession {
  id: number;
  work_id: number;
  user_id: number;
  username?: string; // Included via JOIN for session ownership display
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  is_running: boolean;
  title?: string;
  color?: string;
  created_at: string;
  updated_at: string;
}

export interface TimelineEntry {
  id: number;
  time_session_id: number;
  work_id: number;
  user_id: number;
  timestamp: string;
  label?: string;
  activity_type?: string;
  image_urls?: string[];
  created_at: string;
  updated_at: string;
}

export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
  status: 'ready' | 'processing' | 'uploading' | 'error';
  progress: number;
  error?: string;
}

export interface WorkStats {
  work: Work;
  totalDuration: number;
  estimatedEarnings?: number;
}

export interface StatsOverview {
  dateRange: {
    start: string;
    end: string;
  };
  works: WorkStats[];
}

export interface FileStorageRecord {
  id: number;
  work_id: number;
  user_id: number;
  username?: string; // Included via JOIN for file ownership display
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
  uploaded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  cursor: number | null;
  hasMore: boolean;
}
