-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    authentik_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Works table
CREATE TABLE IF NOT EXISTS works (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    client_name TEXT,
    hourly_rate NUMERIC(10, 2),
    status TEXT DEFAULT 'active',
    tags TEXT[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Time sessions table
CREATE TABLE IF NOT EXISTS time_sessions (
    id SERIAL PRIMARY KEY,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_ms BIGINT,
    is_running BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Timeline entries table
CREATE TABLE IF NOT EXISTS timeline_entries (
    id SERIAL PRIMARY KEY,
    time_session_id INTEGER NOT NULL REFERENCES time_sessions(id) ON DELETE CASCADE,
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    label TEXT NOT NULL,
    activity_type TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_authentik_id ON users(authentik_id);
CREATE INDEX IF NOT EXISTS idx_works_user_id ON works(user_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_time_sessions_work_id ON time_sessions(work_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_user_id ON time_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_time_sessions_is_running ON time_sessions(is_running);
CREATE INDEX IF NOT EXISTS idx_timeline_entries_session_id ON timeline_entries(time_session_id);
CREATE INDEX IF NOT EXISTS idx_timeline_entries_work_id ON timeline_entries(work_id);
CREATE INDEX IF NOT EXISTS idx_timeline_entries_user_id ON timeline_entries(user_id);

-- Trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_works_updated_at BEFORE UPDATE ON works
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
