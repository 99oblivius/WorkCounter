/**
 * Type-safe query parameter array for database operations
 * Replaces usage of any[] in model files
 */
export type QueryParams = (string | number | boolean | Date | null | Buffer | unknown[])[];

export interface User {
  id: number;
  authentik_id?: string | null; // Optional for native auth
  email: string;
  username: string;
  is_active: boolean;
  last_login_at?: Date;
  password_hash?: string;
  password_updated_at?: Date;
  force_password_reset?: boolean;
  failed_login_attempts?: number;
  locked_until?: Date | null;
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
  group_id?: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface WorkGroup {
  id: number;
  user_id: number;
  title: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface TimeSession {
  id: number;
  work_id: number;
  user_id: number;
  username?: string; // Included via JOIN for session ownership display
  start_time: Date;
  end_time?: Date;
  duration_ms?: number;
  is_running: boolean;
  title?: string;
  color?: string;
  created_at: Date;
  updated_at: Date;
}

export interface TimelineEntry {
  id: number;
  time_session_id: number;
  work_id: number;
  user_id: number;
  timestamp: Date;
  label?: string;
  activity_type?: string;
  image_urls?: string[];
  created_at: Date;
  updated_at: Date;
}

export interface UserSessionData {
  userId: number;
  authentikId?: string | null; // Optional for native auth
  email: string;
  username: string;
}

declare module 'express-session' {
  interface SessionData {
    user?: UserSessionData;
  }
}
