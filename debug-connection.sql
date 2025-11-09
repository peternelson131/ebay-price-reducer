-- Debug: Check exact database state for your user
-- This will show EXACTLY what's in the database

SELECT
  id,
  email,
  -- App credentials
  ebay_app_id IS NOT NULL as has_app_id,
  LEFT(ebay_app_id, 20) as app_id_preview,
  ebay_cert_id_encrypted IS NOT NULL as has_cert_id,
  ebay_dev_id,

  -- Connection status
  ebay_connection_status,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  LENGTH(ebay_refresh_token) as refresh_token_length,
  ebay_connected_at,
  ebay_user_id,
  ebay_refresh_token_expires_at,

  -- Timestamps
  created_at,
  updated_at
FROM users
WHERE id = auth.uid();
