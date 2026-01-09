-- Migration: Add eBay OAuth credentials columns to users table
-- Run this in Supabase SQL Editor

-- Add eBay credential columns (all encrypted at rest)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_client_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_client_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_token_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_oauth_state TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ebay_connection_status TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_ebay_connection_status ON users(ebay_connection_status);

-- Add comments for documentation
COMMENT ON COLUMN users.ebay_client_id IS 'Encrypted eBay App Client ID';
COMMENT ON COLUMN users.ebay_client_secret IS 'Encrypted eBay App Client Secret';
COMMENT ON COLUMN users.ebay_access_token IS 'Encrypted eBay OAuth access token (short-lived)';
COMMENT ON COLUMN users.ebay_refresh_token IS 'Encrypted eBay OAuth refresh token (long-lived)';
COMMENT ON COLUMN users.ebay_token_expires_at IS 'When the access token expires';
COMMENT ON COLUMN users.ebay_oauth_state IS 'Temporary state for CSRF protection during OAuth';
COMMENT ON COLUMN users.ebay_connection_status IS 'Status: pending, connected, error';

-- Ensure RLS is enabled (should already be)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Users can only read/update their own row (should already exist, but ensure)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can view own profile'
    ) THEN
        CREATE POLICY "Users can view own profile" ON users
            FOR SELECT USING (auth.uid() = id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Users can update own profile'
    ) THEN
        CREATE POLICY "Users can update own profile" ON users
            FOR UPDATE USING (auth.uid() = id);
    END IF;
END $$;
