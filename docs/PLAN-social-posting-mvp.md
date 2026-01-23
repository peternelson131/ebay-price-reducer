# Implementation Plan: Social Posting MVP

**Date:** 2026-01-23  
**Scope:** Instagram + YouTube only  
**Estimated Effort:** ~35-40 hours  
**Goal:** Ship working social posting to 2 platforms, then expand

---

## MVP Scope

### ✅ In MVP
- Instagram Reels posting
- YouTube Shorts posting
- Basic scheduling (post now or schedule for later)
- List view for scheduled/posted content
- Account connection UI

### ❌ Deferred to Phase 2+
- Calendar view (use list view only)
- 7 other platforms (Facebook, TikTok, Twitter, LinkedIn, Pinterest, Threads, Bluesky)
- Drag-and-drop rescheduling
- Platform-specific caption overrides
- Optimal time suggestions

---

## Task Breakdown

### Phase 1: Foundation (8 hours)

#### Task 1.1: Database Schema
**Owner:** Backend | **Effort:** 2h

Create tables: `social_accounts`, `social_posts`, `post_results`

**Acceptance Criteria:**
- [ ] Tables created with RLS policies
- [ ] Indexes for scheduled post queries
- [ ] Migration tested locally

---

#### Task 1.2: Token Encryption
**Owner:** Backend | **Effort:** 1h

AES-256 encryption for OAuth tokens at rest.

**Acceptance Criteria:**
- [ ] Encrypt/decrypt utilities working
- [ ] Tokens stored encrypted in database

---

#### Task 1.3: Social Accounts API
**Owner:** Backend | **Effort:** 3h

Endpoints: list accounts, start OAuth, callback, disconnect.

**Acceptance Criteria:**
- [ ] `GET /api/social/accounts` - list connected
- [ ] `POST /api/social/accounts/connect/:platform` - OAuth URL
- [ ] `GET /api/social/accounts/callback/:platform` - token exchange
- [ ] `DELETE /api/social/accounts/:id` - disconnect

---

#### Task 1.4: Social Posts API
**Owner:** Backend | **Effort:** 2h

Endpoints: create, list, get, update, delete posts.

**Acceptance Criteria:**
- [ ] Full CRUD for posts
- [ ] Filter by status (draft/scheduled/posted)
- [ ] Include results in GET response

---

### Phase 2: Platform Workers (10 hours)

#### Task 2.1: Worker Base Class
**Owner:** Backend | **Effort:** 2h

Common functionality: token refresh, retries, error handling.

**Acceptance Criteria:**
- [ ] Auto-refresh expired tokens
- [ ] Retry with exponential backoff
- [ ] Standardized error responses

---

#### Task 2.2: Instagram Worker
**Owner:** Backend | **Effort:** 4h

Post to Instagram Reels via Meta Graph API.

**Acceptance Criteria:**
- [ ] OAuth flow completes (popup pattern)
- [ ] Video uploads via container API
- [ ] Post publishes as Reel
- [ ] Returns post URL on success

---

#### Task 2.3: YouTube Worker  
**Owner:** Backend | **Effort:** 4h

Post to YouTube Shorts via Data API v3.

**Acceptance Criteria:**
- [ ] OAuth flow completes
- [ ] Resumable upload for videos
- [ ] Videos ≤60s posted as Shorts
- [ ] Returns video URL on success

---

### Phase 3: Scheduling (4 hours)

#### Task 3.1: Scheduled Post Processor
**Owner:** Backend + DevOps | **Effort:** 3h

Netlify scheduled function to process due posts.

**Acceptance Criteria:**
- [ ] Runs every minute
- [ ] Processes posts where `scheduled_at <= now()`
- [ ] Updates status through lifecycle
- [ ] Handles partial failures gracefully

---

#### Task 3.2: Publish Now Endpoint
**Owner:** Backend | **Effort:** 1h

Immediate publish bypass for drafts.

**Acceptance Criteria:**
- [ ] `POST /api/social/posts/:id/publish`
- [ ] Triggers async processing
- [ ] Returns immediately with processing status

---

### Phase 4: Frontend UI (12 hours)

#### Task 4.1: Account Connection Page
**Owner:** Frontend | **Effort:** 3h

Settings page to connect Instagram + YouTube.

**Acceptance Criteria:**
- [ ] Shows connection status per platform
- [ ] Connect button opens OAuth popup
- [ ] Disconnect with confirmation
- [ ] Refreshes after connection

---

#### Task 4.2: Post Creation Modal
**Owner:** Frontend | **Effort:** 4h

Enhanced modal for creating/scheduling posts.

**Acceptance Criteria:**
- [ ] Platform checkboxes (Instagram, YouTube)
- [ ] Caption textarea with character count
- [ ] "Post Now" vs "Schedule" toggle
- [ ] Date/time picker for scheduling
- [ ] Form validation before submit

---

#### Task 4.3: Posts List Page
**Owner:** Frontend | **Effort:** 3h

List view for all posts with filtering.

**Acceptance Criteria:**
- [ ] Tabs: All, Scheduled, Posted, Drafts
- [ ] Post cards show: thumbnail, caption, platforms, status
- [ ] Actions: Edit, Delete, Post Now
- [ ] Empty states with CTAs

---

#### Task 4.4: Video Gallery Integration
**Owner:** Frontend | **Effort:** 2h

Add "Post to Social" button to video gallery.

**Acceptance Criteria:**
- [ ] Button on each video card
- [ ] Opens post modal with video selected
- [ ] Disabled if no accounts connected

---

### Phase 5: Testing (6 hours)

#### Task 5.1: Integration Tests
**Owner:** QA | **Effort:** 2h

Automated tests for core flows.

**Acceptance Criteria:**
- [ ] Create → Schedule → Verify flow
- [ ] Create → Post Now → Verify flow
- [ ] Token refresh during posting

---

#### Task 5.2: Manual Platform Testing
**Owner:** QA + Pete | **Effort:** 4h

Real posting to test accounts.

**Test Matrix:**
| Platform | OAuth | Post Video | Verify Live |
|----------|-------|------------|-------------|
| Instagram | [ ] | [ ] | [ ] |
| YouTube | [ ] | [ ] | [ ] |

**Acceptance Criteria:**
- [ ] Both platforms OAuth successfully
- [ ] Both platforms accept video posts
- [ ] Posts appear on actual platforms

---

## Execution Timeline

```
Day 1-2: Foundation
├── Task 1.1: Database Schema
├── Task 1.2: Token Encryption
├── Task 1.3: Social Accounts API
└── Task 1.4: Social Posts API

Day 3-4: Platform Workers
├── Task 2.1: Worker Base Class
├── Task 2.2: Instagram Worker
└── Task 2.3: YouTube Worker

Day 5: Scheduling
├── Task 3.1: Scheduled Post Processor
└── Task 3.2: Publish Now Endpoint

Day 6-7: Frontend
├── Task 4.1: Account Connection Page
├── Task 4.2: Post Creation Modal
├── Task 4.3: Posts List Page
└── Task 4.4: Video Gallery Integration

Day 8: Testing & Polish
├── Task 5.1: Integration Tests
└── Task 5.2: Manual Platform Testing
```

**Total: ~8 working days / 35-40 hours**

---

## Environment Setup Required

### Netlify Environment Variables
```env
# Instagram (via Meta)
META_APP_ID=xxx
META_APP_SECRET=xxx

# YouTube (via Google)
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx

# Token encryption
SOCIAL_TOKEN_ENCRYPTION_KEY=xxx

# Feature flag
SOCIAL_POSTING_ENABLED=true
```

### OAuth Redirect URIs
- Instagram: `https://[app-domain]/.netlify/functions/social-callback-instagram`
- YouTube: `https://[app-domain]/.netlify/functions/social-callback-youtube`

---

## Definition of Done (MVP)

- [ ] Can connect Instagram account via OAuth
- [ ] Can connect YouTube account via OAuth
- [ ] Can create a post with video + caption
- [ ] Can schedule post for future time
- [ ] Can post immediately
- [ ] Scheduled posts process automatically
- [ ] Results show success/failure per platform
- [ ] Posts appear on actual Instagram/YouTube

---

## Phase 2 Preview (After MVP)

Once MVP is stable, expand with:

1. **More Platforms** (in priority order)
   - Facebook + Threads (same Meta OAuth)
   - Bluesky (simple API, no OAuth)
   - LinkedIn, Pinterest
   - TikTok (after approval)

2. **Calendar View**
   - Month/week visual scheduling
   - Drag-and-drop rescheduling

3. **Enhanced Features**
   - Platform-specific captions
   - Optimal posting times
   - Analytics integration

---

## Ready for /implement: **YES**

MVP plan is scoped, achievable, and delivers value quickly. 13 tasks, ~40 hours, 2 platforms.

---

*Plan revised: 2026-01-23*
