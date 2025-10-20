-- Migration: Add Token Caching Columns for eBay OAuth
-- Purpose: Enable database-backed caching of access tokens to prevent excessive OAuth refreshes
-- Created: 2025-10-19
--
-- PROBLEM: Access tokens (valid for 2 hours) are currently discarded immediately after OAuth,
--          causing token refresh on EVERY API call. This migration adds columns to cache
--          access tokens and track all token expiration dates.
--
-- SOLUTION:
--   1. Store access tokens in database (not just refresh tokens)
--   2. Track access token expiration (2 hours)
--   3. Track refresh token expiration (18 months)
--   4. Reuse cached access tokens until expiration instead of refreshing constantly

-- Add access token storage and expiration tracking
ALTER TABLE users
ADD COLUMN IF NOT EXISTS ebay_access_token TEXT,
ADD COLUMN IF NOT EXISTS ebay_access_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS ebay_refresh_token_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient token expiration checks
-- This allows fast lookups when checking if tokens are still valid
CREATE INDEX IF NOT EXISTS idx_users_ebay_token_expiry
ON users(ebay_access_token_expires_at)
WHERE ebay_access_token_expires_at IS NOT NULL;

-- Add index for refresh token expiration (for monitoring/warnings)
CREATE INDEX IF NOT EXISTS idx_users_ebay_refresh_token_expiry
ON users(ebay_refresh_token_expires_at)
WHERE ebay_refresh_token_expires_at IS NOT NULL;

-- Add comment to document the schema
COMMENT ON COLUMN users.ebay_access_token IS 'Cached eBay OAuth access token (valid for 2 hours). Updated automatically when refreshed.';
COMMENT ON COLUMN users.ebay_access_token_expires_at IS 'Expiration timestamp for access token. Token should be refreshed before this time.';
COMMENT ON COLUMN users.ebay_refresh_token_expires_at IS 'Expiration timestamp for refresh token (18 months from initial OAuth). User must reconnect after expiration.';

-- Display current token status for verification
SELECT
  id,
  email,
  ebay_connection_status,
  ebay_connected_at,
  ebay_access_token IS NOT NULL as has_access_token,
  ebay_access_token_expires_at,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_refresh_token_expires_at,
  CASE
    WHEN ebay_access_token_expires_at IS NULL THEN 'No access token'
    WHEN ebay_access_token_expires_at < NOW() THEN 'Access token EXPIRED'
    ELSE 'Access token valid for ' || EXTRACT(EPOCH FROM (ebay_access_token_expires_at - NOW()))/60 || ' minutes'
  END as access_token_status,
  CASE
    WHEN ebay_refresh_token_expires_at IS NULL THEN 'No refresh token'
    WHEN ebay_refresh_token_expires_at < NOW() THEN 'Refresh token EXPIRED - reconnect required'
    ELSE 'Refresh token valid for ' || EXTRACT(EPOCH FROM (ebay_refresh_token_expires_at - NOW()))/86400 || ' days'
  END as refresh_token_status
FROM users
WHERE ebay_connection_status = 'connected'
ORDER BY ebay_connected_at DESC;
