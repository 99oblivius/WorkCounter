-- Work groups table for organizing works into folders
CREATE TABLE IF NOT EXISTS work_groups (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, title)
);

-- Add group_id to works table
ALTER TABLE works ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES work_groups(id) ON DELETE SET NULL;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_work_groups_user_id ON work_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_work_groups_display_order ON work_groups(user_id, display_order);
CREATE INDEX IF NOT EXISTS idx_works_group_id ON works(group_id);

-- Trigger for updated_at
CREATE TRIGGER update_work_groups_updated_at
  BEFORE UPDATE ON work_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE work_groups IS 'User-defined groups for organizing works into folders';
COMMENT ON COLUMN work_groups.display_order IS 'Order in which groups are displayed (lower = higher)';
COMMENT ON COLUMN works.group_id IS 'Optional group/folder this work belongs to';
