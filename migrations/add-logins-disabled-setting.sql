-- =====================================================
-- ADD LOGINS_DISABLED SYSTEM SETTING
-- =====================================================
-- This migration adds a system setting to control user logins
-- Admins can disable regular user logins while still being able
-- to log in themselves to re-enable the system.
--

-- Ensure system_state table exists (should already exist)
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the logins_disabled setting (default: enabled/false)
INSERT INTO system_state (key, value, updated_at)
VALUES ('logins_disabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- Verify the setting was added
SELECT * FROM system_state WHERE key = 'logins_disabled';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Successfully added logins_disabled system setting';
    RAISE NOTICE 'Default value: false (logins enabled)';
    RAISE NOTICE 'Admins can toggle this via the admin panel';
END $$;
