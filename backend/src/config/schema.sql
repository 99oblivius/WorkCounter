CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  authentik_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS works (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  client_name VARCHAR(255),
  hourly_rate DECIMAL(10, 2),
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'completed')),
  tags TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS time_sessions (
  id SERIAL PRIMARY KEY,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_ms BIGINT,
  is_running BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id SERIAL PRIMARY KEY,
  time_session_id INTEGER NOT NULL REFERENCES time_sessions(id) ON DELETE CASCADE,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  label TEXT NOT NULL,
  activity_type VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_works_user_id ON works(user_id);
CREATE INDEX idx_works_status ON works(status);
CREATE INDEX idx_time_sessions_work_id ON time_sessions(work_id);
CREATE INDEX idx_time_sessions_user_id ON time_sessions(user_id);
CREATE INDEX idx_time_sessions_is_running ON time_sessions(is_running);
CREATE INDEX idx_timeline_entries_work_id ON timeline_entries(work_id);
CREATE INDEX idx_timeline_entries_session_id ON timeline_entries(time_session_id);
CREATE INDEX idx_timeline_entries_timestamp ON timeline_entries(timestamp);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_works_updated_at BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_time_sessions_updated_at BEFORE UPDATE ON time_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_timeline_entries_updated_at BEFORE UPDATE ON timeline_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
