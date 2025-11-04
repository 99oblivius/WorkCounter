-- Create file_storage table for work-related file uploads
-- Simplified approach: each file gets unique ID, no bundle grouping
-- Supports any file type up to 5GB with resumable uploads via tus protocol

CREATE TABLE IF NOT EXISTS file_storage (
  id SERIAL PRIMARY KEY,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- File identity
  filename VARCHAR(255) NOT NULL,           -- Sanitized filename for storage
  original_name VARCHAR(255) NOT NULL,      -- User's original filename (preserved)
  display_name VARCHAR(255) NOT NULL,       -- For UI display

  -- File metadata
  file_size BIGINT NOT NULL,                -- Bytes
  mime_type VARCHAR(100),                   -- Content-Type (can be null)
  file_extension VARCHAR(20),               -- e.g., "pdf", "psd", "blend"

  -- Storage
  storage_key VARCHAR(500) NOT NULL UNIQUE, -- MinIO path: ${userId}/files/${workId}/${id}-${filename}
  tus_id VARCHAR(255),                      -- tus upload ID for resumability

  -- Upload tracking
  upload_status VARCHAR(20) NOT NULL DEFAULT 'uploading',
  upload_progress INTEGER DEFAULT 0,        -- Percentage 0-100
  uploaded_bytes BIGINT DEFAULT 0,

  -- Error handling
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  uploaded_at TIMESTAMP WITH TIME ZONE,     -- When upload completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT file_upload_status_check
    CHECK (upload_status IN ('uploading', 'completed', 'failed', 'cancelled')),
  CONSTRAINT file_size_check
    CHECK (file_size > 0 AND file_size <= 5368709120), -- 5GB max
  CONSTRAINT upload_progress_check
    CHECK (upload_progress >= 0 AND upload_progress <= 100)
);

-- Indexes for performance
CREATE INDEX idx_file_storage_work_id ON file_storage(work_id);
CREATE INDEX idx_file_storage_user_id ON file_storage(user_id);
CREATE INDEX idx_file_storage_status ON file_storage(upload_status);
CREATE INDEX idx_file_storage_uploaded_at ON file_storage(uploaded_at DESC);

-- Full-text search on filenames (for future search feature)
CREATE INDEX idx_file_storage_display_name ON file_storage
  USING gin(to_tsvector('english', display_name));

-- Trigger for updated_at
CREATE TRIGGER update_file_storage_updated_at
  BEFORE UPDATE ON file_storage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
