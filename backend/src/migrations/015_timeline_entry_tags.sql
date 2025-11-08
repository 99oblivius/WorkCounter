-- Add tags array column to timeline_entries
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS tags TEXT[];

CREATE INDEX IF NOT EXISTS idx_timeline_entries_tags ON timeline_entries USING GIN(tags);

COMMENT ON COLUMN timeline_entries.tags IS 'Array of predefined tag names (e.g., urgent, review, done)';
