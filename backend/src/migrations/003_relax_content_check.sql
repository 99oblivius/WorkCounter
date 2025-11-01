-- Drop the strict content check constraint
-- to allow entries to be created without content initially
-- (images will be uploaded immediately after in a separate request)

-- The application enforces that entries must have either a label or images,
-- but the database constraint was too strict for the two-step creation process:
-- 1. POST /timeline (create entry, possibly with no label/images)
-- 2. POST /timeline/:id/images (upload images)

ALTER TABLE timeline_entries
  DROP CONSTRAINT IF EXISTS timeline_entries_content_check;
