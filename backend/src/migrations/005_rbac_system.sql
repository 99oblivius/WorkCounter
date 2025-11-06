-- Migration: 005_rbac_system.sql
-- Role-Based Access Control System

-- Roles table
CREATE TABLE roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN DEFAULT false, -- Cannot be deleted
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- 'admin', 'files', 'attachments', 'works', 'sessions', 'timeline'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission mapping (many-to-many)
CREATE TABLE role_permissions (
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role mapping (many-to-many for stackable roles)
CREATE TABLE user_roles (
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
  granted_by INTEGER REFERENCES users(id),
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

-- Update users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Indexes
CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_users_active ON users(is_active);
CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_permissions_category ON permissions(category);

-- Insert roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
  ('admin', 'Administrator', 'Full system access with all permissions', true),
  ('file_size_bypass', 'File Size Bypass', 'Can upload files exceeding size limits', true),
  ('file_uploader', 'File Uploader', 'Can upload files to works', true),
  ('attachment_uploader', 'Attachment Uploader', 'Can upload images to notes and timeline', true),
  ('work_sharer', 'Work Sharer', 'Can share works with other users', true),
  ('user', 'Standard User', 'Basic user with work management capabilities', true);

-- Insert permissions
INSERT INTO permissions (name, display_name, description, category) VALUES
  -- Admin permissions
  ('admin.access', 'Access Admin Panel', 'Access to admin panel', 'admin'),
  ('admin.users.view', 'View Users', 'View all users', 'admin'),
  ('admin.users.edit', 'Edit Users', 'Edit user details', 'admin'),
  ('admin.users.roles', 'Manage User Roles', 'Grant/revoke user roles', 'admin'),
  ('admin.users.deactivate', 'Deactivate Users', 'Deactivate user accounts', 'admin'),
  ('admin.settings.view', 'View Settings', 'View system settings', 'admin'),
  ('admin.settings.edit', 'Edit Settings', 'Edit system settings', 'admin'),
  ('admin.audit.view', 'View Audit Logs', 'View system audit logs', 'admin'),

  -- File permissions
  ('files.upload', 'Upload Files', 'Upload files to works', 'files'),
  ('files.bypass_size_limits', 'Bypass File Size Limits', 'Upload files beyond size limits', 'files'),
  ('files.delete_own', 'Delete Own Files', 'Delete files you uploaded', 'files'),
  ('files.view_all', 'View All Files', 'View all files across works', 'files'),

  -- Attachment permissions (images on notes/timeline)
  ('attachments.upload', 'Upload Attachments', 'Upload images to notes and timeline', 'attachments'),
  ('attachments.delete_own', 'Delete Own Attachments', 'Delete attachments you uploaded', 'attachments'),

  -- Work permissions
  ('works.create', 'Create Works', 'Create new works', 'works'),
  ('works.view_own', 'View Own Works', 'View works you own', 'works'),
  ('works.edit_own', 'Edit Own Works', 'Edit works you own', 'works'),
  ('works.delete_own', 'Delete Own Works', 'Delete works you own', 'works'),
  ('works.share', 'Share Works', 'Share works with other users', 'works'),
  ('works.view_shared', 'View Shared Works', 'View works shared with you', 'works'),

  -- Session permissions
  ('sessions.create_own', 'Create Sessions', 'Create time sessions in your works', 'sessions'),
  ('sessions.edit_own', 'Edit Own Sessions', 'Edit sessions you created', 'sessions'),
  ('sessions.delete_own', 'Delete Own Sessions', 'Delete sessions you created', 'sessions'),

  -- Timeline permissions
  ('timeline.create_own', 'Create Timeline Entries', 'Create timeline entries', 'timeline'),
  ('timeline.edit_own', 'Edit Own Timeline', 'Edit timeline entries you created', 'timeline'),
  ('timeline.delete_own', 'Delete Own Timeline', 'Delete timeline entries you created', 'timeline');

-- Assign permissions to roles
-- Admin gets only admin-specific permissions (not file/work/session/timeline permissions)
-- SECURITY: Admins must be explicitly granted file_uploader or other roles to upload files
INSERT INTO role_permissions (role_id, permission_id)
SELECT 1, id FROM permissions WHERE category = 'admin';

-- File Size Bypass
INSERT INTO role_permissions (role_id, permission_id)
SELECT 2, id FROM permissions WHERE name IN ('files.bypass_size_limits');

-- File Uploader
INSERT INTO role_permissions (role_id, permission_id)
SELECT 3, id FROM permissions WHERE name IN ('files.upload', 'files.delete_own');

-- Attachment Uploader
INSERT INTO role_permissions (role_id, permission_id)
SELECT 4, id FROM permissions WHERE name IN ('attachments.upload', 'attachments.delete_own');

-- Work Sharer
INSERT INTO role_permissions (role_id, permission_id)
SELECT 5, id FROM permissions WHERE name IN ('works.share', 'works.view_shared');

-- User (Base) - gets all the basic permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT 6, id FROM permissions WHERE name IN (
  'works.create',
  'works.view_own',
  'works.edit_own',
  'works.delete_own',
  'works.view_shared',
  'sessions.create_own',
  'sessions.edit_own',
  'sessions.delete_own',
  'timeline.create_own',
  'timeline.edit_own',
  'timeline.delete_own'
);

-- Grant base 'user' role to all existing users
INSERT INTO user_roles (user_id, role_id)
SELECT id, 6 FROM users
ON CONFLICT (user_id, role_id) DO NOTHING;

-- Grant 'file_uploader' and 'attachment_uploader' to all existing users (backward compatibility)
INSERT INTO user_roles (user_id, role_id)
SELECT id, 3 FROM users -- file_uploader
ON CONFLICT (user_id, role_id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT id, 4 FROM users -- attachment_uploader
ON CONFLICT (user_id, role_id) DO NOTHING;

COMMENT ON TABLE roles IS 'User roles in the system';
COMMENT ON TABLE permissions IS 'Permissions that can be assigned to roles';
COMMENT ON TABLE role_permissions IS 'Mapping of permissions to roles';
COMMENT ON TABLE user_roles IS 'Mapping of roles to users (stackable)';
