-- Migration: 017_add_missing_admin_permissions.sql
-- Add missing admin permissions that are referenced in code but missing from database
-- Date: 2025-11-09

-- Add missing admin permissions
INSERT INTO permissions (name, display_name, description, category) VALUES
  ('admin.users.delete', 'Delete Users', 'Permanently delete user accounts', 'admin'),
  ('admin.users.reset_password', 'Reset User Passwords', 'Reset passwords for user accounts', 'admin')
ON CONFLICT (name) DO NOTHING;

-- Grant the new permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN ('admin.users.delete', 'admin.users.reset_password')
ON CONFLICT DO NOTHING;

-- Audit log
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
        'migration', '017_add_missing_admin_permissions',
        'description', 'Added admin.users.delete and admin.users.reset_password permissions',
        'permissions_added', 2,
        'timestamp', NOW()
      ),
      'success',
      '127.0.0.1',
      'Migration Script'
    );
  END IF;
END $$;

COMMENT ON TABLE permissions IS 'System permissions - admin.users.delete and admin.users.reset_password added in migration 017';
