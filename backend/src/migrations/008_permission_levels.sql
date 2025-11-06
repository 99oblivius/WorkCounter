-- Migration: 008_permission_levels.sql
-- Refactor to permission levels (viewer, editor, manager) instead of individual boolean flags

-- Step 1: Add permission_level column with enum-like constraint
ALTER TABLE work_shares
ADD COLUMN permission_level TEXT DEFAULT 'viewer'
CHECK (permission_level IN ('viewer', 'editor', 'manager'));

-- Step 2: Migrate existing data from boolean columns to permission_level
UPDATE work_shares
SET permission_level = CASE
  -- Manager: can edit and delete others' content
  WHEN can_edit_others = true AND can_delete_others = true THEN 'manager'
  -- Editor: can create but not edit others
  WHEN can_create = true AND can_edit_others = false THEN 'editor'
  -- Viewer: default (can only view)
  ELSE 'viewer'
END;

-- Step 3: Add index for efficient permission level queries
CREATE INDEX IF NOT EXISTS idx_work_shares_permission_level
ON work_shares(work_id, shared_with_user_id, permission_level);

-- Step 4: Update work_access view to derive permissions from permission_level
DROP VIEW IF EXISTS work_access;

CREATE OR REPLACE VIEW work_access AS
-- Owners have all permissions (manager level)
SELECT
  w.id as work_id,
  w.user_id as owner_id,
  w.user_id as user_id,
  'manager' as permission_level,
  true as is_owner,
  true as can_view,
  true as can_create,
  true as can_edit_others,
  true as can_delete_others,
  -- Legacy compatibility
  true as can_edit,
  true as can_delete,
  'owner' as access_type
FROM works w

UNION ALL

-- Shared users have permissions based on their level
SELECT
  ws.work_id,
  ws.owner_id,
  ws.shared_with_user_id as user_id,
  ws.permission_level,
  false as is_owner,
  -- Derive permissions from level
  true as can_view, -- All levels can view
  CASE
    WHEN ws.permission_level IN ('editor', 'manager') THEN true
    ELSE false
  END as can_create,
  CASE
    WHEN ws.permission_level = 'manager' THEN true
    ELSE false
  END as can_edit_others,
  CASE
    WHEN ws.permission_level = 'manager' THEN true
    ELSE false
  END as can_delete_others,
  -- Legacy compatibility
  CASE
    WHEN ws.permission_level = 'manager' THEN true
    ELSE false
  END as can_edit,
  false as can_delete,
  'shared' as access_type
FROM work_shares ws;

-- Step 5: Create helper function to get permission capabilities
CREATE OR REPLACE FUNCTION get_permission_capabilities(p_level TEXT)
RETURNS TABLE (
  can_view BOOLEAN,
  can_create BOOLEAN,
  can_edit_others BOOLEAN,
  can_delete_others BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    true::BOOLEAN as can_view, -- All levels can view
    (p_level IN ('editor', 'manager'))::BOOLEAN as can_create,
    (p_level = 'manager')::BOOLEAN as can_edit_others,
    (p_level = 'manager')::BOOLEAN as can_delete_others;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 6: Update user_can_modify_resource to work with permission levels
CREATE OR REPLACE FUNCTION user_can_modify_resource(
  p_user_id INTEGER,
  p_work_id INTEGER,
  p_resource_user_id INTEGER,
  p_action TEXT -- 'edit' or 'delete'
) RETURNS BOOLEAN AS $$
DECLARE
  v_permission_level TEXT;
  v_is_owner BOOLEAN;
BEGIN
  -- User always can modify their own content
  IF p_user_id = p_resource_user_id THEN
    RETURN true;
  END IF;

  -- Get user's permission level for this work
  SELECT
    permission_level,
    is_owner
  INTO
    v_permission_level,
    v_is_owner
  FROM work_access
  WHERE work_id = p_work_id AND user_id = p_user_id;

  -- Owner can do everything
  IF v_is_owner THEN
    RETURN true;
  END IF;

  -- Check permission level
  IF v_permission_level IS NULL THEN
    RETURN false;
  END IF;

  -- Only managers can modify others' content
  IF p_action IN ('edit', 'delete') THEN
    RETURN v_permission_level = 'manager';
  END IF;

  RETURN false;
END;
$$ LANGUAGE plpgsql STABLE;

-- Step 7: Add comments
COMMENT ON COLUMN work_shares.permission_level IS 'Permission level: viewer (read-only), editor (create + edit own), manager (full access)';
COMMENT ON FUNCTION get_permission_capabilities IS 'Returns permission capabilities for a given permission level';
COMMENT ON VIEW work_access IS 'Unified view of work access with permission levels: viewer, editor, manager';

-- Step 8: Keep boolean columns for backwards compatibility during transition
-- They will be updated via triggers to stay in sync with permission_level
CREATE OR REPLACE FUNCTION sync_permission_level_to_booleans()
RETURNS TRIGGER AS $$
BEGIN
  -- Update boolean columns based on permission_level
  NEW.can_view := true;
  NEW.can_create := (NEW.permission_level IN ('editor', 'manager'));
  NEW.can_edit_others := (NEW.permission_level = 'manager');
  NEW.can_delete_others := (NEW.permission_level = 'manager');
  NEW.can_edit := (NEW.permission_level = 'manager'); -- Legacy
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sync_permission_level
BEFORE INSERT OR UPDATE OF permission_level ON work_shares
FOR EACH ROW
EXECUTE FUNCTION sync_permission_level_to_booleans();

COMMENT ON FUNCTION sync_permission_level_to_booleans IS 'Keeps boolean permission columns in sync with permission_level for backwards compatibility';
