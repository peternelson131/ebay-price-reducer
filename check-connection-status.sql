-- Check current eBay connection status for your user
-- Run this to see what's in the database

SELECT
  id,
  email,
  ebay_app_id IS NOT NULL as has_app_id,
  ebay_cert_id_encrypted IS NOT NULL as has_cert_id,
  ebay_refresh_token IS NOT NULL as has_refresh_token,
  ebay_connection_status,
  ebay_connected_at,
  ebay_user_id
FROM users
WHERE id = auth.uid();

-- If this shows:
-- has_app_id: true, has_cert_id: true, has_refresh_token: false, ebay_connection_status: 'disconnected'
-- Then the auto-disconnect worked correctly! You just need to reconnect.
