# Scheduled Social Media Posts - Analysis

## Executive Summary
Auto-posting videos to YouTube Shorts, Instagram, TikTok, and Facebook would automate a significant manual task in the influencer workflow. Each platform has different API capabilities, approval requirements, and limitations. **YouTube is the easiest to implement; TikTok and Instagram have stricter approval processes that may take weeks.**

## Problem Statement
After recording Amazon Influencer videos, Pete (and potentially other owners) need to manually upload the same video content to multiple social platforms. This is time-consuming and repetitive. Automating this with scheduled daily posts would save significant time.

## Current State
- Videos are uploaded to Amazon Influencer program manually via Chrome extension workflow
- Videos are stored in OneDrive with product/owner associations
- No integration exists with social media platforms
- Video titles are auto-generated with owner prefixes

---

## Platform Analysis

### 1. YouTube Shorts 🟢 EASIEST

**API:** YouTube Data API v3

**Requirements:**
- Google Cloud Project with YouTube Data API enabled
- OAuth 2.0 authentication (user grants access to their channel)
- Videos < 60 seconds, vertical (9:16) auto-qualify as Shorts

**Capabilities:**
- ✅ Upload videos programmatically
- ✅ Set title, description, tags
- ✅ Set privacy (public, unlisted, private)
- ✅ Schedule uploads for future publish time
- ✅ Add to playlists

**Limitations:**
- Daily quota: ~6 video uploads/day per project (can request increase)
- OAuth tokens expire, need refresh flow
- No direct "Shorts" flag - YouTube auto-detects based on format

**Approval Process:** None - just enable API in Google Cloud Console

**Effort:** Small (S)

---

### 2. Facebook Reels 🟡 MODERATE

**API:** Facebook Graph API (Pages)

**Requirements:**
- Facebook App (developer account)
- Facebook Page (not personal profile)
- Page access token with `pages_manage_posts`, `pages_read_engagement` permissions
- App Review for publishing permissions

**Capabilities:**
- ✅ Upload videos to Pages
- ✅ Post as Reels (video endpoint with `video_type=reels`)
- ✅ Set description, scheduled publish time
- ⚠️ Limited to Pages, not personal profiles

**Limitations:**
- Must be a Facebook Page, not personal account
- App Review required for production use
- Rate limits apply

**Approval Process:** 
- Create Facebook App (instant)
- Submit for App Review (1-5 business days typically)
- Provide demo video of functionality

**Effort:** Medium (M)

---

### 3. Instagram Reels 🟠 HARDER

**API:** Instagram Content Publishing API (via Graph API)

**Requirements:**
- Instagram Business or Creator Account (connected to Facebook Page)
- Facebook App with Instagram permissions
- App Review with additional Instagram permissions
- Video must be hosted at a public URL first

**Capabilities:**
- ✅ Post Reels to Business/Creator accounts
- ✅ Set caption
- ⚠️ Must upload video to public URL first, then provide URL to API
- ⚠️ 2-step process: create container, then publish

**Limitations:**
- No personal account support
- Requires Business/Creator account linked to Facebook Page
- Video must be publicly accessible URL (can't upload directly)
- Additional App Review for Instagram permissions
- Rate limits: 25 posts per 24-hour period

**Approval Process:**
- Facebook App Review (1-5 days)
- Instagram Content Publishing permission review (can take longer)
- Must demonstrate legitimate business use case

**Effort:** Large (L)

---

### 4. TikTok 🔴 HARDEST

**API:** TikTok Content Posting API

**Requirements:**
- TikTok for Developers account
- App registration and review
- OAuth 2.0 authentication
- "Direct Post" capability (requires approval)

**Capabilities:**
- ✅ Upload videos directly (with Direct Post approval)
- ✅ Set caption, privacy settings
- ⚠️ Video privacy can be set (public, friends, private)
- ⚠️ Users must authorize each app

**Limitations:**
- **Strict app review process** - TikTok scrutinizes apps heavily
- Limited daily posting (varies by approval level)
- Requires user to authenticate via TikTok OAuth
- Some capabilities only available to approved partners

**Approval Process:**
- Register as TikTok Developer (instant)
- Create app and submit for review (can take 1-4 weeks)
- May require business verification
- Direct Post capability requires additional approval

**Effort:** XL (Extra Large)

---

## Proposed Approaches

### Option A: YouTube Only (MVP)
**Description:** Start with YouTube Shorts only, as it has the simplest API and no approval delays.

**Implementation:**
1. Add YouTube OAuth connection in Settings
2. Scheduled cron job posts one video per day at user-configured time
3. Uses video title from CRM, adds product link in description

**Pros:**
- Quick to implement (1-2 days)
- No approval wait time
- YouTube is high-value platform for product discovery
- Can iterate and add other platforms later

**Cons:**
- Only covers one platform initially
- Users wanting multi-platform may feel limited

**Effort:** S (Small) - 2-3 days
**Risk:** Low

---

### Option B: YouTube + Facebook (Phase 1)
**Description:** Start with YouTube and Facebook, which have reasonable approval processes.

**Implementation:**
1. YouTube OAuth + Facebook Page connection in Settings
2. Daily scheduled posts to both platforms
3. Facebook App submitted for review in parallel

**Pros:**
- Covers two major platforms
- Facebook review is usually fast (1-5 days)
- Builds foundation for Instagram (same API)

**Cons:**
- Facebook requires Page (not personal profile)
- Slightly longer implementation

**Effort:** M (Medium) - 5-7 days
**Risk:** Low-Medium

---

### Option C: All Platforms (Full Vision)
**Description:** Implement all four platforms from the start.

**Implementation:**
1. Multi-platform OAuth connection manager
2. Platform-specific posting adapters
3. Unified scheduling queue
4. Apply for all platform API access in parallel

**Pros:**
- Complete solution
- Single development effort

**Cons:**
- TikTok approval could block entire feature for weeks
- Higher complexity
- More OAuth flows to maintain
- Instagram business account requirement may not fit all users

**Effort:** XL (Extra Large) - 3-4 weeks (including approval wait times)
**Risk:** High (TikTok approval uncertainty)

---

### Option D: Third-Party Service Integration
**Description:** Use a service like Buffer, Hootsuite, or Later that already has API access.

**Implementation:**
1. Integrate with Buffer/Hootsuite API
2. Push videos to their queue
3. They handle platform-specific posting

**Pros:**
- Faster implementation
- No platform approval needed (they have it)
- Handles platform API changes for us

**Cons:**
- Monthly cost ($15-100+/month depending on tier)
- Dependency on third-party
- May have their own limitations
- Less control

**Effort:** M (Medium) - 5-7 days
**Risk:** Low (but ongoing cost)

---

## Technical Considerations

### Backend
- **OAuth Token Storage:** Secure storage for multiple platform tokens per owner
- **Token Refresh:** Background job to refresh tokens before expiry
- **Upload Queue:** Job queue for scheduled posts with retry logic
- **Video Processing:** May need to resize/transcode for platform requirements
- **Database:** New tables for `social_connections`, `scheduled_posts`, `post_history`

### Frontend
- **Settings Page:** Connect social accounts section
- **Post Scheduler:** Simple daily time picker (Phase 1) → Calendar view (Phase 2)
- **Post History:** Show what was posted, success/failure status
- **Platform Selection:** Which platforms to post to per video

### Infrastructure
- **Cron Jobs:** Reliable scheduled execution (Netlify Scheduled Functions or external)
- **Video Storage:** Videos need to be accessible via URL for Instagram
- **Monitoring:** Track post success/failure, alert on issues

---

## Data Model (Draft)

```sql
-- Social media connections per owner
CREATE TABLE social_connections (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES crm_owners(id),
  platform TEXT NOT NULL, -- 'youtube', 'instagram', 'facebook', 'tiktok'
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_id TEXT, -- platform-specific account/channel ID
  account_name TEXT,
  connected_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Scheduled posts queue
CREATE TABLE scheduled_posts (
  id UUID PRIMARY KEY,
  video_id UUID REFERENCES product_videos(id),
  platform TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ,
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, posted, failed
  posted_at TIMESTAMPTZ,
  platform_post_id TEXT, -- ID returned by platform
  error_message TEXT,
  retry_count INT DEFAULT 0
);

-- User posting preferences
CREATE TABLE posting_schedules (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES crm_owners(id),
  platform TEXT NOT NULL,
  post_time TIME, -- e.g., 09:00
  timezone TEXT DEFAULT 'America/Chicago',
  is_active BOOLEAN DEFAULT true
);
```

---

## Dependencies & Prerequisites

- [ ] Owners need YouTube Channel / Facebook Page / Instagram Business Account / TikTok Account
- [ ] Videos stored with accessible URLs (OneDrive may need public links)
- [ ] Background job infrastructure (scheduled functions)
- [ ] Secure token storage (already have for eBay/OneDrive)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TikTok app rejection | Medium | High | Start with other platforms first |
| Instagram business account requirement | Medium | Medium | Document requirement clearly, offer alternative |
| Platform API changes | Low | Medium | Abstract behind adapter pattern |
| Rate limiting | Low | Low | Queue with delays, respect limits |
| OAuth token expiry | Medium | Medium | Proactive refresh, alerting |

---

## Open Questions for Pete

1. **Which platforms are highest priority?** (Recommend: YouTube first)
2. **Do you have a Facebook Page?** (Required for Facebook/Instagram)
3. **Is your Instagram account Business/Creator?** (Required for Instagram API)
4. **Is TikTok worth the approval wait?** (Could be weeks)
5. **Would a third-party service (Buffer) be acceptable?** (Faster but costs $15-50/mo)
6. **What time of day should posts go out?** (For initial MVP)
7. **Should each owner have separate social accounts?** (Or one account for all?)

---

## Recommendation

**Start with Option A (YouTube Only)** as MVP:
- Fastest to implement (2-3 days)
- No approval delays
- Proves the concept
- Easy to expand later

Then add Facebook in Phase 2 (after App Review), and Instagram/TikTok based on priority and approval success.

---

## Effort Summary

| Approach | Dev Time | Approval Wait | Total Time to Launch |
|----------|----------|---------------|---------------------|
| YouTube Only | 2-3 days | 0 days | 2-3 days |
| YouTube + Facebook | 5-7 days | 1-5 days | 1-2 weeks |
| All Platforms | 3-4 weeks | 2-6 weeks (TikTok) | 1-2 months |
| Buffer Integration | 5-7 days | 0 days | 1 week |

---

*Analysis created: 2026-01-22*
*Status: Draft - Awaiting Pete's Input*
