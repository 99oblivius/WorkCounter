-- Migration: 008_audit_logs.sql
-- Comprehensive Audit Logging System

CREATE TABLE audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(255), -- Denormalized for deleted users
  action VARCHAR(100) NOT NULL, -- 'user.created', 'setting.updated', 'work.shared', etc.
  resource_type VARCHAR(50), -- 'user', 'work', 'setting', 'file', 'session', 'timeline'
  resource_id INTEGER,
  details JSONB, -- Flexible details about the action
  ip_address INET,
  user_agent TEXT,
  status VARCHAR(20) DEFAULT 'success', -- 'success', 'failure', 'warning'
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_status ON audit_logs(status);

-- GIN index for JSONB queries
CREATE INDEX idx_audit_logs_details ON audit_logs USING gin(details);

-- Trigger to log work shares
CREATE OR REPLACE FUNCTION log_work_share()
RETURNS TRIGGER AS $$
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
        'can_edit', NEW.can_edit
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER work_share_audit
AFTER INSERT OR DELETE ON work_shares
FOR EACH ROW EXECUTE FUNCTION log_work_share();

-- Trigger to log role changes
CREATE OR REPLACE FUNCTION log_role_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, details)
    SELECT
      NEW.granted_by,
      u.username,
      'user.role_granted',
      'user',
      NEW.user_id,
      jsonb_build_object(
        'user_id', NEW.user_id,
        'role_id', NEW.role_id
      )
    FROM users u WHERE u.id = NEW.granted_by;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details)
    VALUES (
      NULL,
      'user.role_revoked',
      'user',
      OLD.user_id,
      jsonb_build_object(
        'user_id', OLD.user_id,
        'role_id', OLD.role_id
      )
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_role_audit
AFTER INSERT OR DELETE ON user_roles
FOR EACH ROW EXECUTE FUNCTION log_role_change();

-- Function to auto-cleanup old audit logs (optional, can be called by cron)
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM audit_logs
  WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
  AND status = 'success';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail of all system actions';
COMMENT ON FUNCTION log_work_share IS 'Automatically logs when works are shared or unshared';
COMMENT ON FUNCTION log_role_change IS 'Automatically logs when user roles are granted or revoked';
COMMENT ON FUNCTION cleanup_old_audit_logs IS 'Cleanup old successful audit logs (keep failures/warnings)';
