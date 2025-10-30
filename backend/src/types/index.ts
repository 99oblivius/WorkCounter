export interface User {
  id: number;
  authentik_id: string;
  email: string;
  username: string;
  created_at: Date;
  updated_at: Date;
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
  created_at: Date;
  updated_at: Date;
}

export interface TimeSession {
  id: number;
  work_id: number;
  user_id: number;
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  is_running: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TimelineEntry {
  id: number;
  time_session_id: number;
  work_id: number;
  user_id: number;
  timestamp: Date;
  label: string;
  activity_type?: string;
  created_at: Date;
  updated_at: Date;
}

export interface SessionData {
  userId: number;
  authentikId: string;
  email: string;
  username: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: SessionData;
  }
}
