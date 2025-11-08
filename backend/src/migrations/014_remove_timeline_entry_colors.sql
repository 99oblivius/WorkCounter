-- Remove color column from timeline_entries (no longer needed)
-- Color functionality replaced with proper tag system in future update

-- Drop index first
DROP INDEX IF EXISTS idx_timeline_entries_color;

-- Drop column
ALTER TABLE timeline_entries DROP COLUMN IF EXISTS color;

COMMENT ON TABLE timeline_entries IS 'Timeline entries tracking work activities. Color tags removed in favor of proper tag system.';
