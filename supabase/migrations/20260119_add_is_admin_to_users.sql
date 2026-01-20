-- Add is_admin column to users table for admin account feature
-- Pete will manually set is_admin = true for admin users

ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin);

-- Example: Set a specific user as admin (run manually)
-- UPDATE users SET is_admin = true WHERE id = '<user-uuid>';
