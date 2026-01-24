# TikTok Integration Implementation Summary

**Date:** 2026-01-23  
**Status:** ✅ Complete - Ready for Testing  
**Agent:** Backend Agent

---

## Files Created

### 1. OAuth Endpoints

#### `netlify/functions/tiktok-connect.js` (3.1 KB)
**Purpose:** Initiate TikTok OAuth flow
- Generates CSRF state token
- Stores state in `oauth_states` table with 10-minute expiration
- Builds TikTok authorization URL with required scopes:
  - `user.info.basic`
  - `video.upload`
  - `video.publish`
- Returns authUrl to frontend for popup

**Environment Variables Required:**
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_REDIRECT_URI`

#### `netlify/functions/tiktok-callback.js` (6.4 KB)
**Purpose:** Handle OAuth callback from TikTok
- Verifies state parameter (CSRF protection)
- Exchanges authorization code for tokens:
  - Access token (24-hour expiration)
  - Refresh token (1-year expiration)
- Fetches TikTok user info from `/v2/user/info/` endpoint
- Encrypts and stores tokens in `social_accounts` table
- Stores account metadata:
  - Display name
  - Profile image
  - Follower count
  - Video count
- Redirects to `/integrations?social=connected&platform=tiktok`

**Environment Variables Required:**
- `TIKTOK_CLIENT_KEY`
- `TIKTOK_CLIENT_SECRET`
- `TIKTOK_REDIRECT_URI`

### 2. Social Worker

#### `netlify/functions/utils/social-worker-tiktok.js` (9.2 KB)
**Purpose:** Handle TikTok video posting and token refresh
- Extends `SocialWorkerBase` class
- Implements `platformRefreshToken()`:
  - Uses TikTok's `/v2/oauth/token/` endpoint
  - Refresh tokens valid for 1 year
  - Access tokens valid for 24 hours
- Implements `postToPlatform()`:
  - Uses URL-based upload (TikTok downloads video from our URL)
  - Calls `/v2/post/publish/video/init/` endpoint
  - Returns `publish_id` for tracking
- Implements `validateVideo()`:
  - Max duration: 10 minutes (600 seconds)
  - Min duration: 3 seconds
  - Max file size: 4GB
  - Supported formats: MP4, WebM, MOV
  - Warns about horizontal videos (vertical preferred)
- Handles TikTok-specific features:
  - `is_aigc` flag for AI-generated content
  - Privacy levels (PUBLIC_TO_EVERYONE, etc.)
  - Disable duet/stitch/comments options
  - Video cover timestamp selection

**Post Flow:**
1. Validate video requirements
2. Truncate caption to 2200 characters if needed
3. Initialize upload with video URL
4. TikTok downloads and processes video asynchronously
5. Return publish_id and profile URL

### 3. Integration Updates

#### `netlify/functions/social-accounts-connect.js` (Updated)
- Added `tiktok` to `OAUTH_CONFIG` with TikTok-specific settings

#### `netlify/functions/social-accounts-callback.js` (Updated)
- Added `tiktok` to `TOKEN_CONFIG`
- Added TikTok user info fetching in `getAccountInfo()`
- Uses `open_id` as unique account identifier

#### `netlify/functions/social-post-worker.js` (Updated)
- Imported `TikTokWorker`
- Added `tiktok` to `WORKERS` registry
- Now supports Instagram, YouTube, Facebook, and TikTok

---

## Environment Variables Needed

Add these to Netlify environment (placeholder values for now until Pete provides real credentials):

```env
# TikTok Content Posting API
TIKTOK_CLIENT_KEY=your_client_key_from_tiktok_developer_portal
TIKTOK_CLIENT_SECRET=your_client_secret_from_tiktok_developer_portal
TIKTOK_REDIRECT_URI=https://dainty-horse-49c336.netlify.app/.netlify/functions/tiktok-callback
```

---

## Database Schema

Uses existing `social_accounts` table:
- `platform`: 'tiktok'
- `username`: TikTok display name
- `account_id`: TikTok open_id (unique identifier)
- `access_token`: Encrypted access token (24-hour expiry)
- `refresh_token`: Encrypted refresh token (1-year expiry)
- `token_expires_at`: Timestamp for automatic refresh
- `account_metadata`: JSON with TikTok-specific data

Uses existing `oauth_states` table for CSRF protection.

---

## API Integration Details

### TikTok Content Posting API v2

**OAuth Flow:**
1. Authorization: `https://www.tiktok.com/v2/auth/authorize/`
2. Token Exchange: `https://open.tiktokapis.com/v2/oauth/token/`
3. Token Refresh: `https://open.tiktokapis.com/v2/oauth/token/`
4. User Info: `https://open.tiktokapis.com/v2/user/info/`

**Video Publishing:**
- Endpoint: `https://open.tiktokapis.com/v2/post/publish/video/init/`
- Method: URL-based upload (TikTok pulls from our URL)
- Async processing (returns `publish_id` immediately)

**Video Requirements:**
- Duration: 3 seconds - 10 minutes
- File Size: Max 4GB
- Formats: MP4, WebM, MOV
- Aspect Ratios: 9:16 (recommended), 1:1, 16:9
- Caption: Max 2200 characters

**Special Features:**
- AI content labeling (`is_aigc` flag)
- Privacy controls
- Duet/Stitch/Comment toggles
- Video cover timestamp selection

---

## Testing Checklist

### Prerequisites
- [ ] TikTok Developer account created
- [ ] App created in TikTok Developer Portal
- [ ] Content Posting API access approved
- [ ] Environment variables set in Netlify
- [ ] Callback URL whitelisted in TikTok app settings

### OAuth Flow Testing
- [ ] Click "Connect TikTok" in Integrations page
- [ ] Verify authorization URL is correct
- [ ] Complete OAuth flow on TikTok
- [ ] Verify redirect back to integrations page
- [ ] Check account appears in social_accounts table
- [ ] Verify tokens are encrypted

### Token Refresh Testing
- [ ] Manually set token expiration to past
- [ ] Attempt to post video
- [ ] Verify automatic token refresh
- [ ] Check updated token in database

### Video Posting Testing
- [ ] Create social post with TikTok selected
- [ ] Schedule or post immediately
- [ ] Check Railway worker processes job
- [ ] Verify video appears on TikTok
- [ ] Check post_results table for success
- [ ] Test with AI-generated content flag

### Error Handling Testing
- [ ] Test with expired/invalid token
- [ ] Test with oversized video (>4GB)
- [ ] Test with too-long caption (>2200 chars)
- [ ] Test with rate limiting
- [ ] Test with invalid video format

---

## Implementation Notes

### URL-Based Upload
TikTok uses a different upload method than other platforms:
- **Instagram/Facebook/YouTube:** We upload video bytes directly
- **TikTok:** TikTok downloads video from our public URL

This means the video must be:
1. Hosted on a publicly accessible URL (our `social_ready_url`)
2. Accessible to TikTok's servers (no auth required)
3. Remain available during TikTok's processing window

### Asynchronous Processing
TikTok processes videos asynchronously:
- Upload init returns immediately with `publish_id`
- Video may take several minutes to appear
- No immediate confirmation of success
- Future enhancement: Add status checking endpoint

### AI Content Labeling
TikTok requires disclosure of AI-generated content:
- Set `is_aigc: true` for AI videos
- Required for dubbed videos, AI-generated videos, etc.
- Failure to label may result in account penalties

### Token Expiration
- Access tokens: 24 hours (short!)
- Refresh tokens: 1 year
- Automatic refresh happens 5 minutes before expiry
- Important to handle refresh failures gracefully

---

## Next Steps

1. **Pete's Action Required:**
   - Create TikTok Developer account: https://developers.tiktok.com/
   - Create new app
   - Apply for Content Posting API access
   - Provide credentials to Backend Agent

2. **After Credentials Provided:**
   - Set environment variables in Netlify
   - Deploy updated functions
   - Test OAuth flow end-to-end
   - Test video posting

3. **Frontend Integration:**
   - Add TikTok to Integrations page (Frontend Agent)
   - Add TikTok icon/branding
   - Add to platform selection in PostToSocialModal
   - Add TikTok-specific options (privacy level, is_aigc flag)

4. **Future Enhancements:**
   - Add upload status checking (when TikTok adds endpoint)
   - Add video preview before posting
   - Add scheduling for optimal posting times
   - Add analytics integration

---

## Files Modified

```
netlify/functions/
├── tiktok-connect.js (NEW)
├── tiktok-callback.js (NEW)
├── social-accounts-connect.js (UPDATED)
├── social-accounts-callback.js (UPDATED)
├── social-post-worker.js (UPDATED)
└── utils/
    └── social-worker-tiktok.js (NEW)
```

---

## Code Quality

- ✅ Follows existing patterns from Instagram/YouTube workers
- ✅ Extends `SocialWorkerBase` for consistency
- ✅ Token encryption/decryption handled automatically
- ✅ Automatic token refresh with retry logic
- ✅ Comprehensive error handling
- ✅ Video validation before posting
- ✅ Rate limit handling with backoff
- ✅ Detailed logging for debugging
- ✅ CSRF protection via state parameter
- ✅ Environment variable validation

---

**Implementation Complete!** 🎉

Ready for testing once TikTok developer credentials are provided.
