-- Migration: Update max images to 9
-- Date: 2025-11-01
-- Description: Update constraint to allow up to 9 images (3x3 grid)

-- Drop old constraint
ALTER TABLE timeline_entries
  DROP CONSTRAINT IF EXISTS timeline_entries_max_images_check;

-- Add new constraint for max 9 images
ALTER TABLE timeline_entries
  ADD CONSTRAINT timeline_entries_max_images_check
  CHECK (
    image_urls IS NULL
    OR
    array_length(image_urls, 1) <= 9
  );
