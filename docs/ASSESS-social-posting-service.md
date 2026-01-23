# Impact Assessment: Self-Hosted Social Posting Service

**Date:** 2026-01-23  
**Status:** Ready for /plan  
**Based on:** Review document + comprehensive analysis docs

---

## Objective (from Review)

Enable posting product videos to 9 social media platforms from a single interface with scheduling and automatic video transcoding.

---

## Current State

### Existing Infrastructure
- **Supabase Database:** PostgreSQL with existing tables for users, products, videos
- **Supabase Storage:** 100GB on Pro tier, currently used for video storage
- **Netlify Functions:** API layer for existing features
- **Railway Transcoder:** FFmpeg service for video processing
- **OAuth Flows:** Instagram and YouTube partially implemented

### Existing UI Components
- VideoGallery with video management
- PostToSocialModal (basic implementation exists)
- Settings/Integrations page (partial)

---

## Agent Impact Reports

### Backend Impact

**Database Changes Required:**

1. **social_accounts table** (NEW)
   ```sql
   - id, user_id, platform (enum)
   - username, account_id (platform's ID)
   - access_token (encrypted), refresh_token (encrypted)
   - token_expires_at, scopes
   - created_at, updated_at, last_used_at
   ```

2. **social_posts table** (NEW)
   ```sql
   - id, user_id, video_id
   - caption, scheduled_at
   - platforms (JSONB array of platform configs)
   - status (draft/scheduled/processing/posted/failed)
   - results (JSONB per-platform outcomes)
   - created_at, updated_at
   ```

3. **post_results table** (NEW)
   ```sql
   - id, post_id, social_account_id
   - success, error_message, error_code
   - platform_post_id, platform_post_url
   - posted_at
   ```

**API Endpoints Needed:**
- `POST /api/social/upload-url` - Presigned URLs for media
- `GET/POST/PATCH/DELETE /api/social/posts` - Post CRUD
- `GET /api/social/accounts` - List connected accounts
- `POST /api/social/accounts/connect/{platform}` - OAuth initiation
- `GET /api/social/accounts/callback/{platform}` - OAuth callback
- `DELETE /api/social/accounts/{id}` - Disconnect account
- `POST /api/social/posts/{id}/publish-now` - Immediate publish

**Security Considerations:**
- OAuth tokens MUST be encrypted at rest (Supabase Vault or AES-256)
- Platform API keys stored in environment variables
- Rate limiting per platform (documented in platform-integration-spec.md)

**Risks:**
- Token refresh failures during long scheduling gaps
- Platform API changes breaking integrations
- Rate limit exhaustion on bulk operations

**Rollback:** Feature flag to disable social posting entirely; database migrations are additive (no data loss)

---

### Frontend Impact

**New Pages/Routes:**
1. `/social/schedule` - Calendar view with month/week toggle
2. `/social/posts` - List views (all/scheduled/posted/drafts)
3. `/settings/social-accounts` - Account connection management

**New Components Required:**
- `SocialCalendar` - Month/week views with date navigation
- `PostList` - Filterable, sortable post list
- `ScheduleModal` - Date/time picker with timezone
- `PlatformSelector` - Multi-select with account icons
- `AccountConnector` - OAuth popup trigger with status
- `CaptionEditor` - Platform-specific caption tabs

**Existing Components to Modify:**
- `VideoGallery` - Add "Post to Social" action button
- `PostToSocialModal` - Extend for scheduling + multiple accounts
- `SettingsPage` - Add Social Accounts tab

**State Management:**
- React Query for posts/accounts (with polling for status updates)
- Local state for schedule modal form
- Optimistic updates for post status changes

**UX Flow:**
```
Video Gallery → Click "Post" → Select platforms → Write caption
    → Toggle "Schedule" → Pick date/time → Save
    → Shows in Calendar/List → Cron processes → Results displayed
```

**Risks:**
- Calendar implementation is ~8 hours of work
- Timezone handling complexity (use date-fns-tz)
- Mobile responsiveness for calendar views

**Rollback:** Hide Social nav item via feature flag

---

### DevOps Impact

**Infrastructure Changes:**
- 5-10 new Netlify Functions for social APIs
- 1 Netlify Scheduled Function for processing posts (every 1 min)
- Storage buckets already configured (no changes needed)

**Environment Variables (per platform):**
```
# Meta (Instagram, Facebook, Threads)
META_APP_ID, META_APP_SECRET

# Google (YouTube)
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# TikTok
TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET

# Twitter/X
TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET

# LinkedIn
LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET

# Pinterest
PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET

# Bluesky (no OAuth - uses app password)
BLUESKY_HANDLE, BLUESKY_APP_PASSWORD
```

**Cron/Scheduling:**
- Netlify Scheduled Functions: `@netlify/functions` with cron syntax
- Process due posts every minute
- Timeout consideration: 10 second default, may need 26s for large videos

**Railway Transcoder:**
- Already supports H.264/AAC output
- May need new endpoint for presigned URL integration
- Cost: ~$5/month based on current usage patterns

**Deployment Strategy:**
1. Phase 1: Database migrations (safe, additive)
2. Phase 2: Backend APIs (behind feature flag)
3. Phase 3: Frontend UI (behind feature flag)
4. Phase 4: Enable feature flag for testing
5. Phase 5: Production release

**Monitoring:**
- Log all posting attempts with platform + result
- Alert on 3+ consecutive failures per platform
- Dashboard for daily posting stats

---

### QA Impact

**Test Coverage Needs:**

| Type | What to Test |
|------|-------------|
| Unit | Caption sanitization, date/timezone conversion |
| Integration | Database CRUD, OAuth token refresh |
| E2E | Full post flow (video → schedule → publish) |

**Edge Cases:**
- Scheduled post at midnight UTC vs user timezone
- Daylight saving time transitions
- Token expiration mid-posting
- Platform API returns 429 (rate limit)
- Video > 100MB for platforms with size limits
- Network failure during multi-platform post

**Regression Risks:**
- VideoGallery modifications could break existing functionality
- OAuth changes could affect existing Instagram/YouTube connections

**Manual Testing Requirements:**
- OAuth flows for all 9 platforms
- Actual posting to test/sandbox accounts
- Calendar UI responsiveness on mobile

**Acceptance Criteria (per component):**
1. **Account Connection:** OAuth completes, token stored, account shows in list
2. **Post Creation:** Caption saved, platforms selected, scheduled_at set
3. **Scheduling:** Post appears in calendar at correct time
4. **Publishing:** Post appears on platform, URL stored in results
5. **Error Handling:** Failed posts show error, can retry

**Test Environment:**
- Use sandbox/test accounts where available
- TikTok: Developer sandbox
- Instagram: Test account
- YouTube: Unlisted videos
- Others: May need real posts (delete after testing)

---

## User Experience Assessment

**Current Flow:** None (feature doesn't exist)

**Proposed Flow:**
1. User uploads videos via Chrome extension (existing)
2. User goes to Video Gallery
3. User clicks "Post to Social" on a video
4. Modal opens: select platforms, write caption, optional schedule
5. User clicks "Schedule" or "Post Now"
6. Post appears in Calendar/List view
7. At scheduled time, cron processes post
8. Results show success/failure per platform

**UX Risks:**
- Too many steps? (Mitigate: default caption from video title)
- Confusing calendar? (Mitigate: list view as default)
- Unclear posting status? (Mitigate: clear status badges)

---

## Scale Assessment

**Current Limits:**
- No social posting currently

**Projected Needs (Pete's usage):**
- ~5-20 videos/week
- 3-5 platforms per video
- ~15-100 posts/week total

**Bottlenecks:**
- Platform rate limits (documented per platform)
- Netlify function concurrency (1000 concurrent on Pro)
- Video processing time (30-60 sec per video)

**Scale OK for:** Single user (Pete) - well within limits
**Would need attention at:** 100+ users with similar posting volume

---

## Overall Risk Level: **MEDIUM**

**Why Medium:**
- New infrastructure (social accounts, OAuth) has inherent complexity
- 9 platform integrations is significant scope
- Calendar UI is non-trivial frontend work

**Risk Mitigations:**
- Comprehensive analysis already done (reduced unknowns)
- Existing OAuth patterns for Instagram/YouTube (proven approach)
- Feature flags allow incremental rollout
- Universal video format simplifies platform requirements

---

## Rollback Strategy

**If everything fails:**
1. Disable feature flag (immediate, UI hidden)
2. Database tables remain (no data loss)
3. OAuth tokens remain valid for future use
4. No impact on existing functionality

**If specific platform fails:**
1. Disable that platform in config
2. User sees "Coming soon" for that platform
3. Other platforms continue working

---

## Ready for /plan: **YES**

Impact is understood, risks are manageable, rollback is available. Proceed to implementation planning.

---

*Assessment completed: 2026-01-23*
