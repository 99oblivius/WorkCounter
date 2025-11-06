-- Migration: 007_settings_system.sql
-- System Settings with Database-Driven Configuration

CREATE TABLE system_settings (
  id SERIAL PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  value_type VARCHAR(20) NOT NULL, -- 'string', 'number', 'boolean', 'json'
  category VARCHAR(50) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false, -- Can be exposed to frontend
  default_value TEXT,
  validation_regex TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES users(id)
);

-- Settings change history for audit
CREATE TABLE settings_history (
  id SERIAL PRIMARY KEY,
  setting_id INTEGER REFERENCES system_settings(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT,
  changed_by INTEGER REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address INET,
  user_agent TEXT
);

-- Indexes
CREATE INDEX idx_settings_category ON system_settings(category);
CREATE INDEX idx_settings_public ON system_settings(is_public);
CREATE INDEX idx_settings_history_setting ON settings_history(setting_id);
CREATE INDEX idx_settings_history_changed ON settings_history(changed_at DESC);

-- Insert default settings
INSERT INTO system_settings (key, value, value_type, category, description, is_public, default_value, min_value, max_value) VALUES
  -- File settings
  ('files.max_file_size', '5368709120', 'number', 'files', 'Maximum file upload size in bytes (5GB)', true, '5368709120', 1048576, 10737418240),
  ('files.max_image_size', '52428800', 'number', 'files', 'Maximum image upload size in bytes (50MB)', true, '52428800', 1048576, 104857600),
  ('files.max_note_images', '9', 'number', 'files', 'Maximum images per note/timeline entry', true, '9', 1, 20),
  ('files.allowed_extensions', '["zip","pdf","doc","docx","xls","xlsx","png","jpg","jpeg","gif","webp","txt","md"]', 'json', 'files', 'Allowed file extensions', true, '[]', NULL, NULL),
  ('files.upload_enabled', 'true', 'boolean', 'files', 'Enable file uploads globally', false, 'true', NULL, NULL),

  -- Security settings
  ('security.session_timeout', '86400', 'number', 'security', 'Session timeout in seconds (24h)', false, '86400', 900, 604800),
  ('security.max_login_attempts', '5', 'number', 'security', 'Maximum failed login attempts', false, '5', 3, 10),

  -- General settings
  ('general.site_name', 'WorkCounter', 'string', 'general', 'Application name', true, 'WorkCounter', NULL, NULL),
  ('general.maintenance_mode', 'false', 'boolean', 'general', 'Enable maintenance mode', true, 'false', NULL, NULL),
  ('general.max_works_per_user', '100', 'number', 'general', 'Maximum works per user (0 = unlimited)', false, '100', 0, 1000);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
BEFORE UPDATE ON system_settings
FOR EACH ROW
EXECUTE FUNCTION update_settings_timestamp();

COMMENT ON TABLE system_settings IS 'System-wide configuration settings stored in database';
COMMENT ON TABLE settings_history IS 'Audit trail of all settings changes';
COMMENT ON COLUMN system_settings.is_public IS 'Settings that can be safely exposed to frontend clients';
