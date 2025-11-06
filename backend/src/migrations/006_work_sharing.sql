-- Migration: 006_work_sharing.sql
-- Work Sharing System

-- Work shares table
CREATE TABLE work_shares (
  id SERIAL PRIMARY KEY,
  work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_with_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shared_by INTEGER NOT NULL REFERENCES users(id),
  shared_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  can_edit BOOLEAN DEFAULT false,
  notes TEXT,

  -- Prevent duplicate shares
  UNIQUE(work_id, shared_with_user_id),

  -- Prevent sharing with yourself
  CHECK (owner_id != shared_with_user_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_work_shares_work ON work_shares(work_id);
CREATE INDEX idx_work_shares_shared_with ON work_shares(shared_with_user_id);
CREATE INDEX idx_work_shares_owner ON work_shares(owner_id);

-- View to get work access information
CREATE OR REPLACE VIEW work_access AS
SELECT
  w.id as work_id,
  w.user_id as owner_id,
  w.user_id as user_id,
  true as is_owner,
  true as can_edit,
  true as can_delete,
  'owner' as access_type
FROM works w

UNION ALL

SELECT
  ws.work_id,
  ws.owner_id,
  ws.shared_with_user_id as user_id,
  false as is_owner,
  ws.can_edit,
  false as can_delete,
  'shared' as access_type
FROM work_shares ws;

-- Function to check if user can access work
CREATE OR REPLACE FUNCTION user_can_access_work(
  p_user_id INTEGER,
  p_work_id INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM work_access
    WHERE work_id = p_work_id AND user_id = p_user_id
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- Function to check if user owns resource in work
CREATE OR REPLACE FUNCTION user_owns_resource(
  p_user_id INTEGER,
  p_resource_type TEXT, -- 'session', 'timeline', 'file'
  p_resource_id INTEGER
) RETURNS BOOLEAN AS $$
BEGIN
  CASE p_resource_type
    WHEN 'session' THEN
      RETURN EXISTS (SELECT 1 FROM time_sessions WHERE id = p_resource_id AND user_id = p_user_id);
    WHEN 'timeline' THEN
      RETURN EXISTS (SELECT 1 FROM timeline_entries WHERE id = p_resource_id AND user_id = p_user_id);
    WHEN 'file' THEN
      RETURN EXISTS (SELECT 1 FROM file_storage WHERE id = p_resource_id AND user_id = p_user_id);
    ELSE
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON TABLE work_shares IS 'Tracks which users have access to which works';
COMMENT ON VIEW work_access IS 'Unified view of work access including ownership and shares';
COMMENT ON FUNCTION user_can_access_work IS 'Checks if a user has any access to a work';
COMMENT ON FUNCTION user_owns_resource IS 'Checks if a user owns a specific resource (session/timeline/file)';
