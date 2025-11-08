-- User settings table for per-user preferences
CREATE TABLE IF NOT EXISTS user_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, setting_key)
);

CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX idx_user_settings_key ON user_settings(setting_key);

-- Trigger for updated_at
CREATE TRIGGER update_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Default settings for existing users
INSERT INTO user_settings (user_id, setting_key, setting_value)
SELECT id, 'theme', 'dark' FROM users WHERE NOT EXISTS (
  SELECT 1 FROM user_settings WHERE user_id = users.id AND setting_key = 'theme'
);

INSERT INTO user_settings (user_id, setting_key, setting_value)
SELECT id, 'accentColor', '#3b82f6' FROM users WHERE NOT EXISTS (
  SELECT 1 FROM user_settings WHERE user_id = users.id AND setting_key = 'accentColor'
);
