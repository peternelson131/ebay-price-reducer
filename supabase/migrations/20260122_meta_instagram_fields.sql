-- Add Meta (Facebook/Instagram) specific fields to social_connections
-- For Meta connections, we store:
-- - access_token: Meta long-lived token (60 day expiry)
-- - account_id: Facebook Page ID
-- - account_name: Facebook Page Name
-- - instagram_account_id: Connected Instagram Business Account ID
-- - instagram_username: Instagram username

ALTER TABLE social_connections
ADD COLUMN IF NOT EXISTS instagram_account_id TEXT,
ADD COLUMN IF NOT EXISTS instagram_username TEXT;

-- Add index for Instagram lookups
CREATE INDEX IF NOT EXISTS idx_social_connections_instagram ON social_connections(instagram_account_id) WHERE instagram_account_id IS NOT NULL;
