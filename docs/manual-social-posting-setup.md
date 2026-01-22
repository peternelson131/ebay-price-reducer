# Manual Social Media Posting - Setup Guide

## Overview
This implements manual "Post Now" functionality for social media, replacing automatic scheduled posting.

## Backend Functions

### 1. `social-post.js` - Unified Posting Endpoint
**Endpoint:** `POST /.netlify/functions/social-post`

**Purpose:** Orchestrates posting to multiple platforms in a single request.

**Request Body:**
```json
{
  "videoId": "uuid-of-video",
  "platforms": ["youtube", "facebook", "instagram"],
  "title": "Optional custom title",
  "description": "Optional custom description"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "platform": "youtube",
      "success": true,
      "videoId": "abc123",
      "url": "https://youtube.com/shorts/abc123"
    },
    {
      "platform": "facebook",
      "success": true,
      "postId": "123456789",
      "url": "https://facebook.com/123456789"
    },
    {
      "platform": "instagram",
      "success": false,
      "error": "Instagram account not linked"
    }
  ],
  "message": "Posted to 2/3 platforms"
}
```

**Features:**
- Posts to multiple platforms in parallel
- Returns individual results for each platform
- Records all posts in `scheduled_posts` table
- Handles token refresh automatically
- Graceful error handling per platform

### 2. `meta-post.js` - Facebook/Instagram Posting
**Endpoint:** `POST /.netlify/functions/meta-post`

**Purpose:** Dedicated endpoint for Meta (Facebook/Instagram) posting.

**Request Body:**
```json
{
  "videoId": "uuid-of-video",
  "platforms": ["facebook", "instagram"],
  "title": "Optional custom title",
  "description": "Optional custom description"
}
```

**Facebook Posting:**
- Uses resumable upload (3-phase: start, transfer, finish)
- Supports large video files
- Posts to connected Facebook Page

**Instagram Posting:**
- Requires publicly accessible video URL
- First tries OneDrive public share link
- Falls back to Supabase Storage temp upload
- Uses 2-step process: create container → publish
- Polls for processing completion (max 60 seconds)
- Auto-cleans up temp files

## Supabase Storage Setup

### Required Bucket: `social-media-temp`

**Purpose:** Temporary storage for Instagram video uploads when OneDrive share links don't work.

**Configuration:**
1. Create bucket in Supabase Dashboard:
   - Name: `social-media-temp`
   - Public: **Yes** (Instagram needs public URLs)
   - File size limit: 100 MB (Instagram video limit)

2. Set up auto-cleanup policy:
   ```sql
   -- Create policy to auto-delete files older than 24 hours
   -- (Run this as a scheduled job or Cloud Function)
   CREATE OR REPLACE FUNCTION cleanup_temp_social_videos()
   RETURNS void AS $$
   BEGIN
     -- Delete files older than 24 hours from storage
     -- Note: This requires a Cloud Function or cron job
     -- Netlify function handles cleanup inline after posting
   END;
   $$ LANGUAGE plpgsql;
   ```

3. Set CORS policy (if needed):
   - Allow: `*` (Instagram servers need to fetch the video)

**File Structure:**
```
social-media-temp/
  └── temp/
      └── {userId}/
          └── {timestamp}-{filename}.mp4
```

**Cleanup Strategy:**
- Files are deleted immediately after successful Instagram post
- Failed posts may leave temp files (consider daily cleanup job)

## Database

### Existing Tables Used

**`scheduled_posts`** - Tracks all posts (manual and scheduled)
```sql
-- Structure (already exists)
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  video_id UUID REFERENCES product_videos(id),
  platform TEXT, -- 'youtube', 'facebook', 'instagram'
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  status TEXT, -- 'posted', 'failed'
  title TEXT,
  description TEXT,
  platform_post_id TEXT,
  platform_url TEXT,
  error_message TEXT
);
```

**`social_connections`** - OAuth connections
```sql
-- Meta connection structure (already exists)
{
  user_id: UUID,
  platform: 'meta',
  access_token: TEXT, -- Page access token
  token_expires_at: TIMESTAMPTZ,
  account_id: TEXT, -- Facebook Page ID
  account_name: TEXT, -- Facebook Page name
  instagram_account_id: TEXT, -- Instagram Business Account ID
  instagram_username: TEXT -- @username
}
```

## Scheduled Posting Disabled

The automatic scheduled posting has been disabled in `netlify.toml`:

```toml
# YouTube scheduled posting - DISABLED (using manual posting now)
# [functions."youtube-scheduled-post"]
# schedule = "0 * * * *"
# timeout = 60
```

**Rationale:**
- User wants manual control over what gets posted
- Need to validate Meta posting works before automating
- Can re-enable later by uncommenting the schedule

## Token Refresh Logic

### YouTube
- Tokens expire after 1 hour
- Auto-refresh if < 5 minutes remaining
- Uses Google OAuth refresh tokens

### Meta (Facebook/Instagram)
- Tokens are long-lived (60 days)
- Auto-refresh if < 7 days remaining
- Exchange current token for new long-lived token
- Page access token stored (better for API access)

## Error Handling

### Platform-Specific Errors
Each platform returns individual success/failure status. One platform failing doesn't block others.

**Common Errors:**
- `"YouTube not connected"` - User needs to connect OAuth
- `"Meta not connected"` - User needs to connect Facebook/Instagram
- `"Instagram account not linked"` - Facebook Page has no Instagram Business Account
- `"Failed to download video from OneDrive"` - OneDrive token expired or video deleted
- `"Instagram processing timeout"` - Video is still processing (may succeed later)

### Database Recording
All attempts (success or failure) are recorded in `scheduled_posts` table for audit trail and post history.

## API Integration Notes

### Facebook Graph API
- Version: v18.0
- Video Upload: Resumable upload (3 phases)
- Max file size: 10 GB (practical limit: 1 GB for performance)

### Instagram Graph API
- Version: v18.0
- Reels Upload: Container-based (create → publish)
- Video URL must be publicly accessible
- Processing time: 5-60 seconds
- Max video length: 90 seconds
- Recommended: 9:16 aspect ratio (vertical)

### YouTube Data API
- Version: v3
- Upload: Resumable upload
- Max file size: 256 GB (Shorts: 60 seconds max)

## Frontend Integration (TODO)

The frontend needs to be updated to use these endpoints:

1. **VideoGallery Component:**
   - Add "Post" button to each video
   - Open modal to select platforms
   - Call `/social-post` endpoint
   - Show results per platform

2. **Integrations Page:**
   - Hide/remove "Daily Posting Schedule" section
   - Keep connection status and disconnect buttons
   - Add note: "Manual posting only - scheduling coming soon"

3. **Post History:**
   - Show badges on video cards for posted platforms
   - Display post URLs on hover/click
   - Query `scheduled_posts` table

## Testing Checklist

- [ ] Create Supabase Storage bucket `social-media-temp` (public)
- [ ] Test YouTube posting via `social-post`
- [ ] Test Facebook posting via `social-post`
- [ ] Test Instagram posting via `social-post`
- [ ] Verify OneDrive share link works for Instagram
- [ ] Verify Supabase Storage fallback works for Instagram
- [ ] Confirm temp files are cleaned up after Instagram post
- [ ] Test token refresh for YouTube
- [ ] Test token refresh for Meta
- [ ] Verify post records in `scheduled_posts` table
- [ ] Test error handling (disconnected platforms, missing IG account, etc.)

## Deployment

1. **Backend:** Push to main branch, Netlify auto-deploys functions
2. **Storage:** Create bucket in Supabase Dashboard
3. **Frontend:** Update components to use new endpoints (separate task)

---

**Created:** 2026-01-22  
**Status:** Backend Complete ✅ | Frontend Pending ⏳
