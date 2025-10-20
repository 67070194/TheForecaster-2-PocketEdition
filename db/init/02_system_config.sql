-- System configuration table for persisting web dashboard config
-- This ensures config survives server restarts and provides a source of truth

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default web config (empty initially)
INSERT INTO system_config (key, value)
VALUES ('web_config', '{}')
ON CONFLICT (key) DO NOTHING;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(key);

-- Function to auto-update timestamp
CREATE OR REPLACE FUNCTION update_system_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp on config changes
CREATE TRIGGER trigger_update_system_config_timestamp
BEFORE UPDATE ON system_config
FOR EACH ROW
EXECUTE FUNCTION update_system_config_timestamp();

COMMENT ON TABLE system_config IS 'System-wide configuration storage (key-value pairs)';
COMMENT ON COLUMN system_config.key IS 'Configuration key (unique identifier)';
COMMENT ON COLUMN system_config.value IS 'Configuration value (JSON string for web_config)';
COMMENT ON COLUMN system_config.updated_at IS 'Last update timestamp (auto-managed)';
