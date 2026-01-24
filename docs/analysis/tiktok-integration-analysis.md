# TikTok Integration Analysis

**Date:** 2026-01-23  
**Status:** Planning  
**Priority:** Next platform after Facebook

---

## Executive Summary

TikTok integration requires a separate developer app and API approval process (not connected to Meta). The Content Posting API has restricted access but is available for legitimate business use cases.

---

## TikTok Developer Portal

**Portal URL:** https://developers.tiktok.com/

### Account Requirements
1. TikTok Business Account (or Creator account)
2. Developer account registration
3. App creation and configuration
4. API access approval (Content Posting API is restricted)

---

## Available APIs

### 1. Login Kit (OAuth)
- **Access:** Open
- **Purpose:** Authenticate users, get access tokens
- **Scopes:** `user.info.basic`, `video.list`

### 2. Content Posting API ⚠️ RESTRICTED
- **Access:** Requires approval
- **Purpose:** Upload and publish videos programmatically
- **Scopes:** `video.upload`, `video.publish`
- **Requirements:**
  - Business justification
  - App review process
  - Compliance with content policies

### 3. Share Kit (Alternative)
- **Access:** Open
- **Purpose:** Deep link to TikTok app for sharing
- **Limitation:** Opens TikTok app, doesn't post directly
- **Use case:** Mobile apps, not web automation

---

## Content Posting API Details

### Endpoints
```
POST /v2/post/publish/video/init/     → Initialize video upload
POST /v2/post/publish/inbox/video/init/ → Upload to drafts
POST /v2/post/publish/content/init/   → Publish from URL
```

### Video Requirements
| Requirement | Value |
|-------------|-------|
| Max Duration | 10 minutes (600 seconds) |
| Min Duration | 3 seconds |
| Max File Size | 4GB |
| Supported Formats | MP4, WebM, MOV |
| Aspect Ratios | 9:16 (vertical), 1:1, 16:9 |
| Resolution | 720p minimum recommended |

### Post Options
```typescript
{
  video_url: string;           // Public URL to video file
  title: string;               // Video title/caption (max 2200 chars)
  privacy_level: string;       // "PUBLIC_TO_EVERYONE" | "MUTUAL_FOLLOW_FRIENDS" | "SELF_ONLY"
  disable_duet: boolean;       // Disable duet feature
  disable_stitch: boolean;     // Disable stitch feature
  disable_comment: boolean;    // Disable comments
  video_cover_timestamp_ms: number; // Thumbnail selection
  brand_content_toggle: boolean;    // Branded content disclosure
  brand_organic_toggle: boolean;    // Organic branded content
  is_aigc: boolean;            // AI-generated content label
}
```

---

## App Review Process

### Step 1: Create Developer Account
1. Go to https://developers.tiktok.com/
2. Sign in with TikTok account
3. Accept developer terms

### Step 2: Create App
1. Click "Create App" in developer portal
2. Select "Content Posting API" product
3. Fill in app details:
   - App name
   - Description
   - Website URL
   - Privacy policy URL
   - Terms of service URL

### Step 3: Configure OAuth
1. Set redirect URI: `https://dainty-horse-49c336.netlify.app/.netlify/functions/tiktok-callback`
2. Request scopes:
   - `user.info.basic`
   - `video.upload`
   - `video.publish`

### Step 4: Submit for Review
1. Provide business justification:
   ```
   "We are building a social media management tool for Amazon Influencers 
   to schedule and publish product review videos across multiple platforms 
   including TikTok. Our users create original video content reviewing 
   products and need to efficiently distribute this content."
   ```
2. Provide demo video or screenshots
3. Explain data usage and privacy compliance
4. Wait for approval (typically 1-2 weeks)

---

## Implementation Plan

### Phase 1: Developer Setup (Pete's Action Required)
- [ ] Create TikTok Developer account
- [ ] Create app in developer portal
- [ ] Configure OAuth redirect URI
- [ ] Submit for Content Posting API access
- [ ] Provide credentials to Clawd:
  - Client Key (App ID)
  - Client Secret

### Phase 2: OAuth Integration (After Approval)
- [ ] Create `tiktok-connect.js` endpoint
- [ ] Create `tiktok-callback.js` endpoint
- [ ] Add TikTok to `social_accounts` table
- [ ] Store encrypted tokens

### Phase 3: Content Posting Worker
- [ ] Create `social-worker-tiktok.js`
- [ ] Implement video upload flow
- [ ] Handle TikTok-specific requirements (vertical video, etc.)
- [ ] Add to `social-post-worker.js`

### Phase 4: Frontend Integration
- [ ] Add TikTok to Integrations page
- [ ] Add TikTok to PostToSocialModal
- [ ] Add TikTok icon to SocialPosts page

---

## Environment Variables Needed

```env
TIKTOK_CLIENT_KEY=<from-developer-portal>
TIKTOK_CLIENT_SECRET=<from-developer-portal>
TIKTOK_REDIRECT_URI=https://dainty-horse-49c336.netlify.app/.netlify/functions/tiktok-callback
```

---

## OAuth Flow

### Authorization URL
```
https://www.tiktok.com/v2/auth/authorize/
  ?client_key={CLIENT_KEY}
  &response_type=code
  &scope=user.info.basic,video.upload,video.publish
  &redirect_uri={REDIRECT_URI}
  &state={CSRF_STATE}
```

### Token Exchange
```javascript
POST https://open.tiktokapis.com/v2/oauth/token/
Content-Type: application/x-www-form-urlencoded

client_key={CLIENT_KEY}
&client_secret={CLIENT_SECRET}
&code={AUTH_CODE}
&grant_type=authorization_code
&redirect_uri={REDIRECT_URI}
```

### Token Response
```json
{
  "access_token": "...",
  "expires_in": 86400,
  "open_id": "...",
  "refresh_token": "...",
  "refresh_expires_in": 31536000,
  "scope": "user.info.basic,video.upload,video.publish",
  "token_type": "Bearer"
}
```

---

## Potential Challenges

1. **App Review Timeline** - Can take 1-2 weeks
2. **Vertical Video Requirement** - May need to detect/warn about horizontal videos
3. **Rate Limits** - TikTok has stricter rate limits than other platforms
4. **Draft vs Publish** - May want to offer "post to drafts" option for review before publish
5. **AI Content Labeling** - New requirement for AI-generated content

---

## Credentials Checklist for Pete

To proceed, please provide:

1. [ ] TikTok account username (for developer portal)
2. [ ] After creating app:
   - [ ] Client Key (App ID)
   - [ ] Client Secret
3. [ ] Confirmation of Content Posting API approval status

---

## Next Steps

1. **Pete:** Create TikTok Developer account and app
2. **Pete:** Submit for Content Posting API access
3. **Clawd:** Prepare OAuth endpoints (can start before approval)
4. **Clawd:** Create TikTokWorker (can start before approval)
5. **Together:** Test once API access is approved

---

*Analysis created: 2026-01-23*
