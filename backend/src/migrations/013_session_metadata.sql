-- Add title and color columns to time_sessions
ALTER TABLE time_sessions
  ADD COLUMN IF NOT EXISTS title VARCHAR(255),
  ADD COLUMN IF NOT EXISTS color VARCHAR(20);

-- Add index for potential filtering/searching
CREATE INDEX IF NOT EXISTS idx_time_sessions_color ON time_sessions(color);

COMMENT ON COLUMN time_sessions.title IS 'Optional user-defined title for the session';
COMMENT ON COLUMN time_sessions.color IS 'Optional color tag (red, orange, yellow, green, blue, purple, pink, gray)';
