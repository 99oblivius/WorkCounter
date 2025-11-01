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
  created_at: string;
  updated_at: string;
}

export interface TimeSession {
  id: number;
  work_id: number;
  user_id: number;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  is_running: boolean;
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
