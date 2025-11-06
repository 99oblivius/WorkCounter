-- Migration: 009_cleanup_legacy_permission_columns.sql
-- Remove legacy boolean permission columns after transition to permission_level enum
--
-- SAFETY:
-- - work_access view already derives all permissions from permission_level
-- - All application code uses permission_level or work_access view
-- - Boolean columns were only kept for backwards compatibility during transition
--
-- PREREQUISITE: Update workAccessService queries to compute can_edit from permission_level

-- Step 1: Drop the trigger that syncs boolean columns
DROP TRIGGER IF EXISTS sync_permission_level ON work_shares;
DROP FUNCTION IF EXISTS sync_permission_level_to_booleans();

-- Step 2: Drop the old composite index on boolean columns
DROP INDEX IF EXISTS idx_work_shares_permissions;

-- Step 3: Drop legacy boolean columns
-- These are now redundant as work_access view derives everything from permission_level
ALTER TABLE work_shares
DROP COLUMN IF EXISTS can_view,
DROP COLUMN IF EXISTS can_create,
DROP COLUMN IF EXISTS can_edit_others,
DROP COLUMN IF EXISTS can_delete_others,
DROP COLUMN IF EXISTS can_edit;

-- Step 4: Verify work_access view still works (it derives from permission_level)
-- No changes needed - view already uses permission_level

-- Step 5: Update audit trigger function to use permission_level instead of can_edit
CREATE OR REPLACE FUNCTION public.log_work_share()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details)
    SELECT
      NEW.shared_by,
      u.username,
      'work.shared',
      'work',
      NEW.work_id,
      jsonb_build_object(
        'work_id', NEW.work_id,
        'shared_with_user_id', NEW.shared_with_user_id,
        'permission_level', NEW.permission_level
      )
    FROM users u WHERE u.id = NEW.shared_by;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details)
    SELECT
      OLD.owner_id,
      u.username,
      'work.unshared',
      'work',
      OLD.work_id,
      jsonb_build_object(
        'work_id', OLD.work_id,
        'shared_with_user_id', OLD.shared_with_user_id
      )
    FROM users u WHERE u.id = OLD.owner_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 6: Add comments documenting the cleanup
COMMENT ON FUNCTION log_work_share IS 'Automatically logs when works are shared or unshared (updated to use permission_level)';

COMMENT ON COLUMN work_shares.permission_level IS
'Permission level (viewer, editor, manager). All permission checks derive from this single source of truth.';

COMMENT ON TABLE work_shares IS
'Work sharing with permission levels. Use work_access view for permission checks.';
