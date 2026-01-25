# Setup Login Disable Feature

## Overview
This feature allows admins to temporarily disable user logins system-wide while still allowing admin access.

## Database Setup Required

The `system_state` table needs to be created in Supabase. Follow these steps:

### Step 1: Open Supabase SQL Editor
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to **SQL Editor** in the left sidebar
4. Click **New Query**

### Step 2: Run This SQL

Copy and paste the following SQL into the editor and click **Run**:

```sql
-- Create system_state table
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

-- Allow service role to manage
CREATE POLICY "Service role can manage system state"
ON system_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE system_state IS 'Stores system-wide state information for scheduled jobs and admin features';

-- Insert logins_disabled setting (default: enabled)
INSERT INTO system_state (key, value, updated_at)
VALUES ('logins_disabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

-- Verify
SELECT * FROM system_state WHERE key = 'logins_disabled';
```

### Step 3: Verify Setup

After running the SQL, verify it worked by running the setup script:

```bash
cd ~/clawd/projects/ebay-price-reducer
node setup-login-disable-feature.js
```

You should see:
```
✅ system_state table exists
✅ logins_disabled setting already exists
🎉 Login Disable feature is ready!
```

## Deployment

After database setup, deploy the changes:

```bash
cd ~/clawd/projects/ebay-price-reducer
# The changes are already in the codebase, just need to deploy
git add .
git commit -m "Add login disable feature for admin panel"
git push
```

Netlify will automatically deploy the updated functions.

## Testing

### Test 1: Toggle Works
1. Log in as an admin user
2. Go to **Account** page
3. Click **Admin** tab (should be visible)
4. Find the "User Login Control" section at the top
5. Click "Disable Logins" button
6. Verify the status changes to "DISABLED"

### Test 2: Regular Users Blocked
1. Log out
2. Try to log in with a **non-admin** user account
3. Should see error: "User logins are temporarily disabled. Please try again later."

### Test 3: Admins Can Still Login
1. While logins are disabled, log in with an **admin** account
2. Should succeed and see dashboard
3. Check console logs - should see: "✅ Admin login allowed for [email] despite logins being disabled"

### Test 4: Re-enable Logins
1. As admin, go to Account > Admin tab
2. Click "Enable Logins"
3. Verify status changes back to "ENABLED"
4. Log out and log back in as regular user - should work

## Files Modified

### Backend
- `netlify/functions/toggle-logins.js` (NEW) - API endpoint to toggle login status
- `netlify/functions/auth-login.js` (MODIFIED) - Checks login status and blocks non-admins

### Frontend
- `frontend/src/pages/Account.jsx` (MODIFIED) - Added admin toggle UI

### Database
- `migrations/add-logins-disabled-setting.sql` (NEW) - Migration script
- `system_state` table - Stores the logins_disabled setting

## How It Works

1. **Database**: `system_state` table stores key-value pairs. The `logins_disabled` key holds 'true' or 'false'.

2. **API Endpoint** (`/toggle-logins`):
   - GET: Returns current status
   - POST: Toggles status (admin only)
   - Uses service role key to access system_state table

3. **Auth Flow** (`/auth-login`):
   - After successful auth, checks `logins_disabled` setting
   - If disabled AND user is not admin → block with error message
   - If disabled AND user is admin → allow and log

4. **Frontend**:
   - Admin tab shows toggle switch
   - Displays current status with color indicator
   - Shows warning banner when disabled
   - Only visible to admin users

## Security Notes

- ✅ Only admins can toggle login status (role check in API)
- ✅ Admins can always log in (even when disabled)
- ✅ RLS policies protect system_state table
- ✅ Service role key required for system_state access
- ✅ Regular users get clear error message (no system details)

## Troubleshooting

**Error: "Could not find the table 'public.system_state'"**
- The database setup hasn't been completed yet
- Run the SQL from Step 2 above in Supabase SQL Editor

**Toggle button doesn't show**
- Make sure you're logged in as an admin user
- Check that `users.is_admin` is true for your account

**Changes not working after deploy**
- Clear browser cache and hard refresh (Cmd+Shift+R)
- Check Netlify deploy logs for errors
- Verify functions deployed successfully

## Questions?

Contact the dev team or check the implementation in the files listed above.
