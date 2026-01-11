# Story 8: Remove Per-User eBay App Credentials

## Problem
The codebase has inconsistent handling of eBay App credentials:
- Some files use `process.env.EBAY_CLIENT_ID` (correct for multi-tenant)
- Some files read `user.ebay_client_id` from database (wrong)

Users should NOT provide their own eBay Developer App credentials.
Platform uses ONE eBay App; users only OAuth to connect their seller accounts.

## Acceptance Criteria

### Backend Changes
- [ ] `utils/ebay-oauth.js` - Use `process.env.EBAY_CLIENT_ID` and `process.env.EBAY_CLIENT_SECRET`
- [ ] `utils/category-mapper.js` - Use env vars instead of user database fields
- [ ] `ebay-connection-status.js` - Remove check for `hasClientId`
- [ ] `ebay-disconnect.js` - Remove clearing of `ebay_client_id` and `ebay_client_secret`
- [ ] `ebay-oauth-callback.js` - Store only tokens, not app credentials

### Database Cleanup (Optional/Later)
- [ ] Consider removing `ebay_client_id` and `ebay_client_secret` columns from users table
- [ ] Clear any existing values in these columns

### Frontend (Already Clean)
- ✅ No UI for entering eBay Client ID or Secret
- ✅ OAuth flow just calls `/ebay-oauth-start` with auth token
- ✅ AdminSettings redirects to Account page

## Files to Modify

1. `netlify/functions/utils/ebay-oauth.js`
   - Line 140: Remove select of `ebay_client_id, ebay_client_secret`
   - Lines 153-154: Change to use `process.env.EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET`

2. `netlify/functions/utils/category-mapper.js`
   - Line 84: Remove select of `ebay_client_id, ebay_client_secret`
   - Lines 92-93: Change to use env vars

3. `netlify/functions/ebay-connection-status.js`
   - Line 58: Remove `ebay_client_id` from select
   - Line 72: Remove `hasClientId` check

4. `netlify/functions/ebay-disconnect.js`
   - Lines 57-58: Remove clearing of `ebay_client_id`, `ebay_client_secret`

5. `netlify/functions/ebay-oauth-callback.js`
   - Audit: Ensure it doesn't store app credentials in user record

## Test Cases

| Test | Expected |
|------|----------|
| T1: OAuth start | Uses env var `EBAY_CLIENT_ID`, not database |
| T2: Token refresh | Uses env var credentials |
| T3: API calls | Access token refreshed with env var credentials |
| T4: New user OAuth | Connects without providing app credentials |
| T5: Existing user with old data | Still works (env vars used instead) |

## Non-Goals
- Remove database columns (can be done later, low priority)
- Change Keepa API key handling (correctly per-user)
