-- Migration: 010_fix_viewer_permissions.sql
-- Fix permission logic to prevent viewers from modifying even their own content
--
-- ISSUE: Viewers were able to delete their own notes and sessions because
-- user_can_modify_resource function allowed users to always modify their own content
-- regardless of permission level.
--
-- FIX: Update function to require at least Editor permission to modify own content

CREATE OR REPLACE FUNCTION public.user_can_modify_resource(
  p_user_id integer,
  p_work_id integer,
  p_resource_user_id integer,
  p_action text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_permission_level TEXT;
  v_is_owner BOOLEAN;
BEGIN
  -- Get user's permission level for this work first
  SELECT
    permission_level,
    is_owner
  INTO
    v_permission_level,
    v_is_owner
  FROM work_access
  WHERE work_id = p_work_id AND user_id = p_user_id;

  -- No access at all
  IF v_permission_level IS NULL THEN
    RETURN false;
  END IF;

  -- Owner can do everything
  IF v_is_owner THEN
    RETURN true;
  END IF;

  -- User can modify their own content IF they have at least Editor permission
  IF p_user_id = p_resource_user_id THEN
    -- Viewers cannot modify even their own content
    -- Only Editor and Manager can modify their own content
    RETURN v_permission_level IN ('editor', 'manager');
  END IF;

  -- Only managers can modify others' content
  IF p_action IN ('edit', 'delete') THEN
    RETURN v_permission_level = 'manager';
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION user_can_modify_resource IS
'Check if user can modify resource. Viewers cannot modify anything. Editors can modify own content. Managers can modify any content.';
