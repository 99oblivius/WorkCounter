-- Remove tags column from timeline_entries
ALTER TABLE timeline_entries DROP COLUMN IF EXISTS tags;

DROP INDEX IF EXISTS idx_timeline_entries_tags;

COMMENT ON COLUMN timeline_entries.activity_type IS 'Predefined activity type (e.g., meeting, coding, review, break)';
