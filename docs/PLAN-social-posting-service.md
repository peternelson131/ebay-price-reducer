# Implementation Plan: Self-Hosted Social Posting Service

**Date:** 2026-01-23  
**Status:** Ready for /implement  
**Estimated Total Effort:** ~28 hours

---

## Objective

Enable posting product videos to 9 social media platforms from a single interface with scheduling and automatic video transcoding.

---

## Task List

### Phase 1: Database & Infrastructure

---

#### Task 1.1: Create Database Schema
**Owner:** Backend  
**Dependencies:** None  
**Complexity:** Medium  
**Estimated effort:** 2 hours

**Description:**
Create new database tables for social accounts, posts, and results. Include proper indexes and RLS policies.

**Schema:**
```sql
-- social_accounts
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  platform TEXT NOT NULL, -- 'instagram', 'tiktok', etc.
  username TEXT NOT NULL,
  platform_account_id TEXT,
  access_token TEXT, -- encrypted
  refresh_token TEXT, -- encrypted
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[],
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, platform, platform_account_id)
);

-- social_posts
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users,
  video_id UUID REFERENCES product_videos,
  caption TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ,
  platforms JSONB NOT NULL DEFAULT '[]',
  platform_captions JSONB DEFAULT '{}',
  status TEXT DEFAULT 'draft', -- draft, scheduled, processing, posted, failed, partial
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- post_results
CREATE TABLE post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts,
  platform TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  error_code TEXT,
  platform_post_id TEXT,
  platform_post_url TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at) 
  WHERE status = 'scheduled';
CREATE INDEX idx_social_posts_user ON social_posts(user_id);
CREATE INDEX idx_social_accounts_user ON social_accounts(user_id);
CREATE INDEX idx_post_results_post ON post_results(post_id);
```

**Acceptance Criteria:**
- [ ] All three tables created with proper types
- [ ] RLS policies allow user access to own data only
- [ ] Indexes created for query performance
- [ ] Migration file created and tested

**Test Requirements:**
- [ ] Unit: Verify table constraints (unique, foreign keys)
- [ ] Integration: Insert/select/update operations work
- [ ] Verify RLS blocks cross-user access

**Rollback:** Drop tables in reverse order (post_results, social_posts, social_accounts)

---

#### Task 1.2: Setup Token Encryption
**Owner:** Backend  
**Dependencies:** Task 1.1  
**Complexity:** Medium  
**Estimated effort:** 1 hour

**Description:**
Implement encryption for OAuth tokens at rest. Use AES-256-GCM with a key from environment variable.

**Acceptance Criteria:**
- [ ] Encryption utility functions created (encrypt/decrypt)
- [ ] Encryption key loaded from SOCIAL_TOKEN_ENCRYPTION_KEY env var
- [ ] Tokens encrypted before insert, decrypted on read
- [ ] Encrypted tokens are base64 encoded for storage

**Test Requirements:**
- [ ] Unit: encrypt→decrypt returns original value
- [ ] Unit: Different plaintexts produce different ciphertexts
- [ ] Integration: Encrypted token persists and decrypts correctly

**Rollback:** Remove encryption wrapper, tokens stored in plain (temporary)

---

### Phase 2: Backend APIs

---

#### Task 2.1: Social Accounts CRUD API
**Owner:** Backend  
**Dependencies:** Task 1.1, 1.2  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Create API endpoints for managing social accounts: list, connect (OAuth start), callback, disconnect.

**Endpoints:**
- `GET /api/social/accounts` - List user's connected accounts
- `POST /api/social/accounts/connect/:platform` - Start OAuth flow
- `GET /api/social/accounts/callback/:platform` - OAuth callback handler
- `DELETE /api/social/accounts/:id` - Disconnect account

**Acceptance Criteria:**
- [ ] List returns all user's accounts (token fields excluded)
- [ ] Connect endpoint returns OAuth authorization URL
- [ ] Callback exchanges code for token and stores encrypted
- [ ] Disconnect deletes account record
- [ ] Errors return appropriate HTTP status codes

**Test Requirements:**
- [ ] Integration: List empty, connect, list shows account
- [ ] Integration: Disconnect removes from list
- [ ] Unit: OAuth URL generation is correct per platform
- [ ] Manual: Full OAuth flow for each platform

**Rollback:** Remove API files, no impact on other features

---

#### Task 2.2: Social Posts CRUD API
**Owner:** Backend  
**Dependencies:** Task 1.1  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Create API endpoints for managing posts: create, list, get, update, delete.

**Endpoints:**
- `GET /api/social/posts` - List posts (with filters: status, date range)
- `POST /api/social/posts` - Create new post
- `GET /api/social/posts/:id` - Get single post with results
- `PATCH /api/social/posts/:id` - Update post (if not yet processing)
- `DELETE /api/social/posts/:id` - Delete post

**Acceptance Criteria:**
- [ ] Create accepts: video_id, caption, platforms[], scheduled_at?, platform_captions?
- [ ] Create sets status to 'draft' or 'scheduled' based on scheduled_at
- [ ] List supports filtering by status, pagination
- [ ] Get includes related post_results
- [ ] Update only allowed for draft/scheduled posts
- [ ] Delete cascades to post_results

**Test Requirements:**
- [ ] Integration: Full CRUD lifecycle
- [ ] Unit: Status transitions are valid
- [ ] Unit: Cannot update processing/posted posts
- [ ] Edge: Large caption handling (2200 char limit)

**Rollback:** Remove API files

---

#### Task 2.3: Publish Now Endpoint
**Owner:** Backend  
**Dependencies:** Task 2.1, 2.2  
**Complexity:** Medium  
**Estimated effort:** 2 hours

**Description:**
Create endpoint to immediately publish a post (bypass scheduling).

**Endpoint:**
- `POST /api/social/posts/:id/publish` - Publish immediately

**Acceptance Criteria:**
- [ ] Sets status to 'processing'
- [ ] Triggers background publish to all platforms
- [ ] Returns immediately (async processing)
- [ ] Updates status to 'posted'/'partial'/'failed' when complete
- [ ] Creates post_result records for each platform

**Test Requirements:**
- [ ] Integration: Post goes from draft→processing→posted
- [ ] Integration: Partial success updates status correctly
- [ ] Unit: Error handling for invalid post states

**Rollback:** Remove endpoint file

---

#### Task 2.4: Presigned URL Service
**Owner:** Backend  
**Dependencies:** None  
**Complexity:** Low  
**Estimated effort:** 1 hour

**Description:**
Create endpoint for generating presigned upload URLs for media (if needed beyond existing video upload).

**Endpoint:**
- `POST /api/social/media/upload-url` - Get presigned URL

**Acceptance Criteria:**
- [ ] Returns presigned URL for Supabase Storage
- [ ] Accepts file type and size hints
- [ ] URL expires after 15 minutes
- [ ] Returns media_id for reference

**Test Requirements:**
- [ ] Integration: URL allows direct upload
- [ ] Unit: Expiration time is correct

**Rollback:** Remove endpoint file

---

### Phase 3: Platform Integrations

---

#### Task 3.1: Platform Worker Base Class
**Owner:** Backend  
**Dependencies:** Task 2.3  
**Complexity:** Medium  
**Estimated effort:** 2 hours

**Description:**
Create abstract base class for platform workers with common functionality (token refresh, error handling, retries).

**Acceptance Criteria:**
- [ ] Base class handles token refresh before operations
- [ ] Retry logic with exponential backoff
- [ ] Standard error classification (auth, rate-limit, content, unknown)
- [ ] Logging for all operations

**Test Requirements:**
- [ ] Unit: Token refresh called when expired
- [ ] Unit: Retry logic fires correct number of times
- [ ] Unit: Error classification is accurate

**Rollback:** N/A (base class only)

---

#### Task 3.2: Meta Platforms Worker (Instagram, Facebook, Threads)
**Owner:** Backend  
**Dependencies:** Task 3.1  
**Complexity:** High  
**Estimated effort:** 4 hours

**Description:**
Implement posting to Instagram Reels, Facebook Reels, and Threads using Meta Graph API.

**Acceptance Criteria:**
- [ ] Instagram: Video uploaded, container created, published
- [ ] Facebook: Video uploaded to page, published
- [ ] Threads: Video posted with caption
- [ ] All three share OAuth flow (Meta unified)
- [ ] Thumbnail timestamp supported (Instagram)

**Test Requirements:**
- [ ] Integration: Post to Instagram test account
- [ ] Integration: Post to Facebook test page
- [ ] Integration: Post to Threads test account
- [ ] Edge: Token refresh mid-publish
- [ ] Edge: Rate limit handling

**Rollback:** Disable platforms in config

---

#### Task 3.3: YouTube Worker
**Owner:** Backend  
**Dependencies:** Task 3.1  
**Complexity:** Medium  
**Estimated effort:** 2 hours

**Description:**
Extend existing YouTube integration for Shorts posting via Data API v3.

**Acceptance Criteria:**
- [ ] Videos ≤60s posted as Shorts (9:16)
- [ ] Title and description from caption
- [ ] Resumable upload for large files
- [ ] Privacy setting configurable (unlisted for testing)

**Test Requirements:**
- [ ] Integration: Post Short to test channel
- [ ] Edge: Large file (>100MB) upload
- [ ] Edge: Token refresh during upload

**Rollback:** Disable YouTube in config

---

#### Task 3.4: TikTok Worker
**Owner:** Backend  
**Dependencies:** Task 3.1  
**Complexity:** High  
**Estimated effort:** 3 hours

**Description:**
Implement TikTok Content Posting API integration.

**Acceptance Criteria:**
- [ ] Video uploaded via direct post API
- [ ] Caption and title set
- [ ] AIGC label support (for AI-generated content)
- [ ] Draft mode support

**Test Requirements:**
- [ ] Integration: Post to TikTok sandbox
- [ ] Unit: AIGC label correctly set
- [ ] Edge: Rate limit handling

**Rollback:** Disable TikTok in config

---

#### Task 3.5: Remaining Platform Workers
**Owner:** Backend  
**Dependencies:** Task 3.1  
**Complexity:** Medium  
**Estimated effort:** 4 hours

**Description:**
Implement workers for Twitter/X, LinkedIn, Pinterest, and Bluesky.

**Per-Platform Acceptance Criteria:**

**Twitter:**
- [ ] Media upload (chunked for video)
- [ ] Tweet with media ID

**LinkedIn:**
- [ ] Asset registration
- [ ] ugcPost creation

**Pinterest:**
- [ ] Video pin creation
- [ ] Board selection support
- [ ] Link URL support

**Bluesky:**
- [ ] Blob upload
- [ ] Post record creation
- [ ] App password auth (not OAuth)

**Test Requirements:**
- [ ] Integration: Post to each platform's test account
- [ ] Edge: Platform-specific error handling

**Rollback:** Disable individual platforms in config

---

### Phase 4: Scheduling & Cron

---

#### Task 4.1: Scheduled Post Processor
**Owner:** Backend + DevOps  
**Dependencies:** Task 3.2-3.5  
**Complexity:** Medium  
**Estimated effort:** 2 hours

**Description:**
Create Netlify Scheduled Function to process due posts every minute.

**Acceptance Criteria:**
- [ ] Runs every minute via cron
- [ ] Queries for posts where status='scheduled' AND scheduled_at <= now()
- [ ] Processes up to 10 posts per run
- [ ] Updates status during/after processing
- [ ] Handles errors gracefully (marks failed, continues)

**Test Requirements:**
- [ ] Integration: Scheduled post processes at correct time
- [ ] Unit: Query returns correct posts
- [ ] Edge: Multiple posts at same time
- [ ] Edge: Post fails, others still process

**Rollback:** Disable scheduled function

---

#### Task 4.2: Post Status Tracking
**Owner:** Backend  
**Dependencies:** Task 4.1  
**Complexity:** Low  
**Estimated effort:** 1 hour

**Description:**
Add endpoints for checking post status and results.

**Endpoint:**
- `GET /api/social/posts/:id/status` - Get current status + results

**Acceptance Criteria:**
- [ ] Returns status and all post_results
- [ ] Includes platform URLs for successful posts
- [ ] Includes error messages for failures

**Test Requirements:**
- [ ] Integration: Status reflects processing progress
- [ ] Unit: All result fields returned

**Rollback:** Remove endpoint file

---

### Phase 5: Frontend UI

---

#### Task 5.1: Account Connection Page
**Owner:** Frontend  
**Dependencies:** Task 2.1  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Create settings page for connecting social accounts with OAuth popup flow.

**Components:**
- PlatformCard (shows platform, connection status, connect/disconnect buttons)
- AccountsList (grid of platform cards)

**Acceptance Criteria:**
- [ ] Shows all 9 platforms with icons
- [ ] Connected accounts show username + status
- [ ] Connect button opens OAuth popup
- [ ] Disconnect button with confirmation
- [ ] Real-time refresh after connection

**Test Requirements:**
- [ ] E2E: Navigate to page, see all platforms
- [ ] E2E: Connect flow (manual OAuth)
- [ ] Unit: Platform card renders correctly

**Rollback:** Hide settings tab

---

#### Task 5.2: Post Creation Modal (Enhanced)
**Owner:** Frontend  
**Dependencies:** Task 5.1, Task 2.2  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Enhance PostToSocialModal with platform selection, scheduling, and caption editing.

**Components:**
- PlatformSelector (multi-select with account avatars)
- CaptionEditor (with character count per platform)
- ScheduleToggle (switch + datetime picker)
- TimezoneSelector (dropdown)

**Acceptance Criteria:**
- [ ] Select multiple platforms/accounts
- [ ] Caption shows character count (platform limits)
- [ ] Schedule toggle reveals datetime picker
- [ ] Timezone defaults to user's local
- [ ] "Post Now" and "Schedule" buttons
- [ ] Form validation before submit

**Test Requirements:**
- [ ] E2E: Create scheduled post flow
- [ ] E2E: Create immediate post flow
- [ ] Unit: Character count accuracy
- [ ] Unit: Timezone conversion

**Rollback:** Revert to basic modal

---

#### Task 5.3: Calendar View
**Owner:** Frontend  
**Dependencies:** Task 2.2  
**Complexity:** High  
**Estimated effort:** 6 hours

**Description:**
Create calendar component showing scheduled and posted content.

**Components:**
- CalendarHeader (month/week toggle, navigation arrows, date display)
- MonthView (7-column grid with day cells)
- WeekView (7-column for current week)
- DayCell (shows post thumbnails/counts)
- PostPreview (hover/click detail)

**Acceptance Criteria:**
- [ ] Month view shows 6 weeks grid
- [ ] Week view shows current week with more detail
- [ ] Navigation arrows change month/week
- [ ] Today highlighted
- [ ] Posts shown as thumbnails/icons on their scheduled date
- [ ] Click post to view details
- [ ] Click empty day to create new post

**Test Requirements:**
- [ ] E2E: Navigate calendar, see posts
- [ ] Unit: Date calculations correct
- [ ] Unit: Month/week boundaries correct
- [ ] Visual: Mobile responsive

**Rollback:** Hide calendar route, show list only

---

#### Task 5.4: Post List Views
**Owner:** Frontend  
**Dependencies:** Task 2.2  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Create list views for all/scheduled/posted/drafts with filtering.

**Components:**
- PostListFilters (status tabs, date range, platform filter)
- PostListItem (thumbnail, caption preview, platforms, status badge, actions)
- PostListEmpty (empty state with CTA)

**Acceptance Criteria:**
- [ ] Tabs: All, Scheduled, Posted, Drafts
- [ ] Each post shows: thumbnail, caption preview, platforms, status, date
- [ ] Actions: Edit, Delete, Post Now (for drafts/scheduled)
- [ ] Sort by date (newest first default)
- [ ] Pagination or infinite scroll

**Test Requirements:**
- [ ] E2E: Filter by status
- [ ] E2E: Edit post from list
- [ ] Unit: Status badge colors correct

**Rollback:** Hide list routes

---

#### Task 5.5: Video Gallery Integration
**Owner:** Frontend  
**Dependencies:** Task 5.2  
**Complexity:** Low  
**Estimated effort:** 1 hour

**Description:**
Add "Post to Social" action to VideoGallery component.

**Acceptance Criteria:**
- [ ] "Post to Social" button on each video card
- [ ] Button disabled if no accounts connected (with tooltip)
- [ ] Opens enhanced PostToSocialModal with video pre-selected

**Test Requirements:**
- [ ] E2E: Click button, modal opens with video
- [ ] Unit: Button state based on accounts

**Rollback:** Remove button

---

### Phase 6: Testing & Polish

---

#### Task 6.1: Integration Testing
**Owner:** QA  
**Dependencies:** All previous tasks  
**Complexity:** Medium  
**Estimated effort:** 3 hours

**Description:**
Write and run integration tests for full post flow.

**Test Scenarios:**
- [ ] Connect account → Create post → Schedule → Verify in calendar
- [ ] Create draft → Edit → Post Now → Verify results
- [ ] Schedule post → Cancel → Verify not processed
- [ ] Multi-platform post → Partial failure → Verify results

**Acceptance Criteria:**
- [ ] All happy paths pass
- [ ] Error paths handled gracefully
- [ ] No regressions in existing features

**Rollback:** N/A

---

#### Task 6.2: Manual Platform Testing
**Owner:** QA (with Pete)  
**Dependencies:** Task 6.1  
**Complexity:** High  
**Estimated effort:** 4 hours

**Description:**
Manually test OAuth flows and actual posting to each platform.

**Test Matrix:**
| Platform | OAuth | Post | Verify |
|----------|-------|------|--------|
| Instagram | [ ] | [ ] | [ ] |
| Facebook | [ ] | [ ] | [ ] |
| YouTube | [ ] | [ ] | [ ] |
| TikTok | [ ] | [ ] | [ ] |
| Twitter | [ ] | [ ] | [ ] |
| LinkedIn | [ ] | [ ] | [ ] |
| Pinterest | [ ] | [ ] | [ ] |
| Threads | [ ] | [ ] | [ ] |
| Bluesky | [ ] | [ ] | [ ] |

**Acceptance Criteria:**
- [ ] Each platform OAuth completes successfully
- [ ] Each platform accepts video post
- [ ] Post URL returned and valid

**Rollback:** N/A

---

## Execution Order

```
Week 1 (Foundation):
├── Task 1.1: Database Schema [Backend] ──────────────────┐
├── Task 1.2: Token Encryption [Backend] ─────────────────┤
└── Task 2.4: Presigned URLs [Backend] ───────────────────┤
                                                          │
Week 1-2 (APIs):                                          │
├── Task 2.1: Accounts API [Backend] ←────────────────────┤
├── Task 2.2: Posts API [Backend] ←───────────────────────┘
└── Task 2.3: Publish Endpoint [Backend]

Week 2 (Platform Workers):
├── Task 3.1: Worker Base Class [Backend]
├── Task 3.2: Meta Platforms [Backend] (parallel)
├── Task 3.3: YouTube [Backend] (parallel)
├── Task 3.4: TikTok [Backend] (parallel)
└── Task 3.5: Other Platforms [Backend] (parallel)

Week 2-3 (Scheduling):
├── Task 4.1: Cron Processor [Backend + DevOps]
└── Task 4.2: Status Tracking [Backend]

Week 3 (Frontend):
├── Task 5.1: Account Connection [Frontend]
├── Task 5.2: Post Modal [Frontend]
├── Task 5.3: Calendar View [Frontend]
├── Task 5.4: List Views [Frontend]
└── Task 5.5: Gallery Integration [Frontend]

Week 4 (Testing):
├── Task 6.1: Integration Tests [QA]
└── Task 6.2: Manual Platform Tests [QA + Pete]
```

---

## Verification Points

| After Task | Verify |
|------------|--------|
| 1.1 | Database tables exist, migrations run |
| 2.1 | Can connect/disconnect one test account |
| 2.2 | Can create/list/update/delete posts |
| 3.2 | Can post to Instagram manually |
| 4.1 | Scheduled post processes automatically |
| 5.2 | Can create post from UI |
| 5.3 | Calendar shows scheduled posts |
| 6.2 | All platforms working end-to-end |

---

## Overall Rollback Strategy

**Complete rollback:**
1. Set feature flag `SOCIAL_POSTING_ENABLED=false`
2. UI immediately hides all social posting features
3. Cron function checks flag, skips processing
4. Database tables remain (data preserved)
5. OAuth tokens remain valid

**To fully remove:**
1. Drop tables: post_results, social_posts, social_accounts
2. Remove API files
3. Remove frontend components
4. Remove environment variables

---

## Feature Flags

```env
# Master toggle
SOCIAL_POSTING_ENABLED=true

# Per-platform toggles (for gradual rollout)
SOCIAL_PLATFORM_INSTAGRAM=true
SOCIAL_PLATFORM_FACEBOOK=true
SOCIAL_PLATFORM_YOUTUBE=true
SOCIAL_PLATFORM_TIKTOK=true
SOCIAL_PLATFORM_TWITTER=true
SOCIAL_PLATFORM_LINKEDIN=true
SOCIAL_PLATFORM_PINTEREST=true
SOCIAL_PLATFORM_THREADS=true
SOCIAL_PLATFORM_BLUESKY=true
```

---

## Ready for /implement: **YES**

Plan is complete with clear tasks, ownership, acceptance criteria, and test requirements. 23 tasks across 6 phases, estimated ~28 hours total.

---

*Plan completed: 2026-01-23*
