-- Migration: 009_native_auth.sql
-- Native Authentication Support - Migrating away from Authentik SSO
-- CRITICAL: This migration preserves all existing user data

-- Step 1: Add password and security fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS password_updated_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS force_password_reset BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP;

-- Step 2: Make authentik_id nullable (for backward compatibility during transition)
ALTER TABLE users ALTER COLUMN authentik_id DROP NOT NULL;

-- Step 3: Add unique constraints on username and email for login
-- First, check if there are duplicates and handle them
DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
  END IF;
END $$;

-- Step 4: Create indexes for efficient login lookups
CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users(LOWER(username));
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until);

-- Step 5: Mark all existing users to require password reset
-- This ensures existing users will need to set a password
UPDATE users
SET force_password_reset = true
WHERE password_hash IS NULL;

-- Step 6: Add new permission for user password management
INSERT INTO permissions (name, display_name, description, category) VALUES
  ('admin.users.create', 'Create Users', 'Create new user accounts', 'admin'),
  ('users.change_own_password', 'Change Own Password', 'Change your own password', 'users')
ON CONFLICT (name) DO NOTHING;

-- Grant admin the new permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
  AND p.name IN ('admin.users.create', 'users.change_own_password')
ON CONFLICT DO NOTHING;

-- Grant all users the ability to change their own password
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'user'
  AND p.name = 'users.change_own_password'
ON CONFLICT DO NOTHING;

-- Step 7: Create audit log entries for this migration
DO $$
BEGIN
  -- Only log if audit_logs table exists
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
      'auth.migration',
      'system',
      jsonb_build_object(
        'migration', '009_native_auth',
        'description', 'Migrated from Authentik SSO to native authentication',
        'users_affected', (SELECT COUNT(*) FROM users),
        'timestamp', NOW()
      ),
      'success',
      '127.0.0.1',
      'Migration Script'
    );
  END IF;
END $$;

COMMENT ON COLUMN users.password_hash IS 'BCrypt hashed password for native authentication';
COMMENT ON COLUMN users.password_updated_at IS 'Timestamp of last password change';
COMMENT ON COLUMN users.force_password_reset IS 'User must reset password on next login';
COMMENT ON COLUMN users.failed_login_attempts IS 'Counter for failed login attempts (for account locking)';
COMMENT ON COLUMN users.locked_until IS 'Account locked until this timestamp due to failed login attempts';

-- Verification queries (commented out, but useful for manual verification)
-- SELECT COUNT(*) as total_users FROM users;
-- SELECT COUNT(*) as users_need_password FROM users WHERE password_hash IS NULL;
-- SELECT COUNT(*) as users_with_password FROM users WHERE password_hash IS NOT NULL;
