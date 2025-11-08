-- Add color column to timeline_entries for color tagging
ALTER TABLE timeline_entries ADD COLUMN IF NOT EXISTS color VARCHAR(20);

-- Add index for filtering by color (optional, for potential future features)
CREATE INDEX IF NOT EXISTS idx_timeline_entries_color ON timeline_entries(color);

COMMENT ON COLUMN timeline_entries.color IS 'Optional color tag for the timeline entry (e.g., red, orange, yellow, green, blue, purple, pink, gray)';
