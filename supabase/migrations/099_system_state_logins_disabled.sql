-- Create system_state table for storing system-wide settings
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_state_updated_at ON system_state(updated_at);

-- Enable RLS
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (idempotent)
DROP POLICY IF EXISTS "Service role can manage system state" ON system_state;

-- Allow service role to manage
CREATE POLICY "Service role can manage system state"
ON system_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE system_state IS 'Stores system-wide state information for scheduled jobs and admin features';
COMMENT ON COLUMN system_state.key IS 'Unique identifier for the state entry';
COMMENT ON COLUMN system_state.value IS 'State value (string format, parse as needed)';

-- Insert logins_disabled setting (default: enabled/false)
INSERT INTO system_state (key, value, updated_at, created_at)
VALUES ('logins_disabled', 'false', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- Verify the setting was created
SELECT * FROM system_state WHERE key = 'logins_disabled';
