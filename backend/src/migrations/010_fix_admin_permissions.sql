-- Migration: 010_fix_admin_permissions.sql
-- Fix Admin Role Permissions - Remove non-admin permissions
-- Date: 2025-11-06
-- SECURITY FIX: Admins should only have admin panel access, not automatic file/work permissions

-- Remove all non-admin permissions from admin role
-- Admin role should only have permissions in the 'admin' category
DELETE FROM role_permissions
WHERE role_id = 1  -- admin role
AND permission_id IN (
  SELECT id FROM permissions WHERE category != 'admin'
);

-- Verify: Admin should now only have these permissions:
-- - admin.access
-- - admin.users.view
-- - admin.users.edit
-- - admin.users.roles
-- - admin.users.deactivate
-- - admin.users.create
-- - admin.settings.view
-- - admin.settings.edit
-- - admin.audit.view
-- - users.change_own_password (if in admin category)

-- Grant all existing admin users the 'user' role for basic functionality
-- This ensures admins can still create works, sessions, etc.
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT DISTINCT ur.user_id, 6, ur.user_id  -- 6 = 'user' role
FROM user_roles ur
WHERE ur.role_id = 1  -- admin role
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur2
  WHERE ur2.user_id = ur.user_id AND ur2.role_id = 6
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Grant all existing admin users the 'file_uploader' role for file uploads
-- This maintains backward compatibility
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT DISTINCT ur.user_id, 3, ur.user_id  -- 3 = 'file_uploader' role
FROM user_roles ur
WHERE ur.role_id = 1  -- admin role
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur2
  WHERE ur2.user_id = ur.user_id AND ur2.role_id = 3
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Grant all existing admin users the 'attachment_uploader' role for attachments
-- This maintains backward compatibility
INSERT INTO user_roles (user_id, role_id, granted_by)
SELECT DISTINCT ur.user_id, 4, ur.user_id  -- 4 = 'attachment_uploader' role
FROM user_roles ur
WHERE ur.role_id = 1  -- admin role
AND NOT EXISTS (
  SELECT 1 FROM user_roles ur2
  WHERE ur2.user_id = ur.user_id AND ur2.role_id = 4
)
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Log this migration in audit logs
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs') THEN
    INSERT INTO audit_logs (
      user_id,
      username,
      action,
      resource_type,
      details,
      status,
      ip_address,
      user_agent
    ) VALUES (
      NULL,
      'SYSTEM',
      'permissions.migration',
      'system',
      jsonb_build_object(
        'migration', '010_fix_admin_permissions',
        'description', 'Restricted admin role to only admin-specific permissions',
        'admins_affected', (SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE role_id = 1),
        'timestamp', NOW()
      ),
      'success',
      '127.0.0.1',
      'Migration Script'
    );
  END IF;
END $$;

COMMENT ON COLUMN role_permissions.role_id IS 'Admin role (id=1) should only have admin category permissions';
