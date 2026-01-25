-- =====================================================
-- ADD SIGNUPS_DISABLED SYSTEM SETTING
-- =====================================================
-- This migration adds a system setting to control new user signups
-- Admins can disable new account creation via the admin panel
--

-- Ensure system_state table exists (should already exist)
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert the signups_disabled setting (default: enabled/false)
INSERT INTO system_state (key, value, updated_at)
VALUES ('signups_disabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- Verify the setting was added
SELECT * FROM system_state WHERE key = 'signups_disabled';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Successfully added signups_disabled system setting';
    RAISE NOTICE 'Default value: false (signups enabled)';
    RAISE NOTICE 'Admins can toggle this via the admin panel';
END $$;
