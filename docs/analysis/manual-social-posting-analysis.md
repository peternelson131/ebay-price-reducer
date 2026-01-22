# Manual Social Media Posting Analysis

## Executive Summary
Replace automatic scheduled posting with a manual "Post Now" button on CRM records. This allows testing social media connections and gives users full control over what/when they post, with scheduling to be added later.

## Problem Statement
Current scheduling system auto-posts videos daily based on time settings, but:
- User wants manual control over which content gets posted
- Need to verify Meta (Facebook/Instagram) connection actually works before automating
- Scheduling adds complexity before core posting functionality is validated

## Current State

### Database Schema
```
posting_schedules       - User schedule settings (time, timezone, is_active)
scheduled_posts         - Post history tracking (user, video, platform, status, url)
social_connections      - OAuth tokens for YouTube, Meta
product_videos          - Videos linked to sourced_products
```

### Existing Functions
| Function | Purpose | Status |
|----------|---------|--------|
| `youtube-post.js` | Manual post to YouTube | ✅ Exists |
| `youtube-scheduled-post.js` | Cron job for auto-posting | ✅ Exists (disable) |
| `meta-status.js` | Check Meta connection | ✅ Exists |
| `meta-post.js` | Post to Facebook/Instagram | ❌ Missing |

### UI Components
- **Integrations page**: Shows schedule settings per platform
- **VideoGallery**: Shows videos for a CRM product (good place for Post button)
- **ProductCRM**: Product detail with VideoGallery component

## Proposed Approach

### Option A: Post Button in VideoGallery (Recommended)
**Description:** Add "Post" button to each video in the VideoGallery component. Opens modal to select platforms.

**User Flow:**
1. User opens CRM record
2. Scrolls to Product Videos section  
3. Clicks "Post" on a video thumbnail
4. Modal shows: ☑️ YouTube ☑️ Facebook ☑️ Instagram
5. Click "Post Now" → posts to selected platforms
6. Shows success/failure per platform

**Pros:**
- Natural location (video is already displayed)
- Clear association between video and post action
- Can show post history per video

**Cons:**
- Requires modal for platform selection
- VideoGallery component gets more complex

**Effort:** Medium

### Option B: Bulk Post from CRM List
**Description:** Select multiple products, bulk action to post their videos.

**Pros:**
- Batch operations for efficiency
- Consistent with other bulk actions

**Cons:**
- Less clear which video will be posted
- Overkill for initial testing phase

**Effort:** Medium-Large

### Option C: Dedicated "Post Queue" Page
**Description:** New page showing videos ready to post with platform toggles.

**Pros:**
- Full overview of content
- Can reorder/prioritize

**Cons:**
- New page to build
- Separate from product context
- Overkill for MVP

**Effort:** Large

## Recommendation: Option A

Simple, focused, and solves the immediate need.

## Technical Implementation

### Backend Changes

#### 1. Create `meta-post.js` (NEW)
```javascript
// POST /meta-post
// Body: { videoId, platforms: ['facebook', 'instagram'] }
// Posts video to selected Meta platforms

// Facebook: POST to /{page-id}/videos with video URL
// Instagram: POST to /{ig-user-id}/media → /{ig-user-id}/media_publish
```

#### 2. Create `social-post.js` (NEW - unified endpoint)
```javascript
// POST /social-post
// Body: { videoId, platforms: ['youtube', 'facebook', 'instagram'] }
// Orchestrates posting to multiple platforms
// Returns: { results: [{ platform, success, url, error }] }
```

#### 3. Disable scheduled posting
- Remove cron schedule from `netlify.toml` for `youtube-scheduled-post`
- Or set all `is_active = false` in `posting_schedules`

### Frontend Changes

#### 1. Update VideoGallery component
- Add "Post" button to each video card
- Create `PostToSocialModal` component with platform checkboxes
- Show loading state during posting
- Display results (success URLs or errors)

#### 2. Remove schedule UI from Integrations page
- Hide or remove "Daily Posting Schedule" section
- Keep connection status and disconnect buttons
- Add note: "Manual posting only - scheduling coming soon"

#### 3. Show post history on video
- Badge showing platforms video has been posted to
- Hover/click to see URLs

### Database Changes
None required - existing `scheduled_posts` table tracks all posts.

## Meta Posting Technical Notes

### Facebook Page Video Post
```javascript
// Get page access token from social_connections
// Upload video: POST https://graph.facebook.com/v18.0/{page-id}/videos
// Body: { source: videoFile, description: "..." }
```

### Instagram Reels Post
```javascript
// Instagram requires a hosted video URL, can't direct upload
// Option 1: Upload to temporary storage, get URL, then post
// Option 2: Use OneDrive share link (may not work)

// Step 1: Create container
// POST /{ig-user-id}/media
// { video_url, media_type: 'REELS', caption }

// Step 2: Publish
// POST /{ig-user-id}/media_publish
// { creation_id }
```

**⚠️ Instagram Challenge:** Requires publicly accessible video URL. May need:
- Temporary S3/Cloudflare R2 upload
- Or Supabase Storage with public bucket

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Instagram video URL requirement | High | Medium | Use temp storage or defer IG |
| Meta API rate limits | Low | Low | Manual posting = low volume |
| Token expiration during post | Medium | Medium | Refresh before posting |

## Open Questions

1. **Instagram video hosting**: Accept temp storage approach, or defer Instagram posting?
2. **Post history visibility**: Show on video card, or separate section in CRM?
3. **Post to all platforms default**: Pre-check all connected platforms, or require selection?

## Next Steps (if approved)

1. Disable scheduled posting (remove cron or toggle off)
2. Create `social-post.js` unified endpoint
3. Create `meta-post.js` for Facebook (defer Instagram if URL issue)
4. Update VideoGallery with Post button + modal
5. Remove schedule UI from Integrations
6. Test with Pete's accounts

---
*Analysis created: 2026-01-22*
*Status: Draft - Awaiting Review*
