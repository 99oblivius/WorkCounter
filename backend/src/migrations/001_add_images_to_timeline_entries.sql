-- Migration: Add image support to timeline entries
-- Date: 2025-11-01
-- Description: Add image_urls column and make label nullable for image-only notes

-- Make label nullable (allow image-only notes)
ALTER TABLE timeline_entries
  ALTER COLUMN label DROP NOT NULL;

-- Add image_urls array column
ALTER TABLE timeline_entries
  ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Add constraint to ensure at least one of label or images exists
ALTER TABLE timeline_entries
  ADD CONSTRAINT timeline_entries_content_check
  CHECK (
    (label IS NOT NULL AND label != '')
    OR
    (image_urls IS NOT NULL AND array_length(image_urls, 1) > 0)
  );

-- Add constraint to limit max 8 images
ALTER TABLE timeline_entries
  ADD CONSTRAINT timeline_entries_max_images_check
  CHECK (
    image_urls IS NULL
    OR
    array_length(image_urls, 1) <= 8
  );

-- Add index for querying entries with images
CREATE INDEX IF NOT EXISTS idx_timeline_entries_has_images
  ON timeline_entries(id)
  WHERE image_urls IS NOT NULL AND array_length(image_urls, 1) > 0;
