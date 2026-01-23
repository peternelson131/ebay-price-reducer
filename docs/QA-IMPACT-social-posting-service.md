# QA Impact Assessment: Social Media Posting Service

**Date:** 2026-01-23  
**Assessed By:** QA Agent  
**Feature:** Self-hosted social media posting service (9 platforms)  
**Risk Level:** 🔴 **HIGH** - Complex multi-platform integration with external dependencies

---

## Executive Summary

This feature introduces significant complexity with:
- **9 external platform APIs** (each with unique auth, rate limits, and failure modes)
- **Background processing** (cron-based scheduling requiring reliability testing)
- **Video transcoding pipeline** (FFmpeg - resource-intensive, error-prone)
- **OAuth flows** (security-critical, platform-specific)
- **Time-sensitive operations** (scheduling across timezones)

**Estimated Testing Effort:** 40-50 hours (more than implementation at 28h)  
**Automation Coverage Target:** 70% (30% must be manual due to OAuth and real platform posting)

---

## 1. Test Coverage Needs

### 1.1 Unit Tests (Target: 85% coverage)

#### Video/Media Service
- **Presigned URL generation**
  - Valid URL structure and expiration times
  - S3 bucket permissions and path generation
  - URL validation before returning to client
  
- **FFmpeg transcoding logic**
  - Command building for H.264/AAC MP4 conversion
  - Resolution/bitrate calculation logic
  - File format detection and validation
  - Error message parsing from FFmpeg output
  
- **Video metadata extraction**
  - Duration, dimensions, codec detection
  - Corrupted/incomplete file handling
  - Mock FFmpeg output parsing

#### Post Service Core
- **Post creation validation**
  - Required field validation per platform
  - Caption length limits (platform-specific)
  - Video duration limits (TikTok max 10min, YouTube no limit, etc.)
  - Hashtag validation rules
  
- **Scheduling logic**
  - Date/time validation (must be future)
  - Timezone conversion accuracy
  - Boundary condition calculations (start of day, end of month, etc.)
  - Recurring schedule generation (if applicable)
  
- **Post status state machine**
  - State transitions (draft → scheduled → posting → posted → failed)
  - Invalid state transition prevention
  - Retry logic for failed posts

#### Platform-Specific Adapters
- **Each of 9 platforms needs:**
  - Request payload building (mock API calls)
  - Response parsing logic
  - Error code mapping to user-friendly messages
  - Rate limit handling logic
  - Token refresh trigger conditions

#### Utility Functions
- **Timezone helpers**
  - UTC conversion accuracy
  - DST transition handling
  - Timezone name validation
  
- **Caption processors**
  - Mention/hashtag extraction
  - URL shortening/handling
  - Emoji encoding (some platforms are picky)
  - Character counting (Unicode awareness)

### 1.2 Integration Tests (Target: 75% coverage)

#### Database Operations
- **social_posts table CRUD**
  - Create post with all relationships (user, video, platforms)
  - Update post status and results
  - Query filtering (by status, scheduled_time, platform)
  - Soft delete behavior
  
- **Video storage integration**
  - Upload flow: presigned URL → client upload → webhook processing
  - Transcode completion updates video record
  - Orphaned file cleanup (videos without posts after 24h)
  
- **OAuth token storage**
  - Encrypted token storage/retrieval
  - Token refresh before expiration
  - Multi-platform token management per user

#### Background Job Processing
- **Cron job execution**
  - Job picker: finds posts scheduled for "now" (with buffer)
  - Concurrent job handling (avoid duplicate posting)
  - Job retry with exponential backoff
  - Job timeout handling (stuck jobs)
  
- **Post execution workflow**
  - Load video file from storage
  - Call platform API with retry logic
  - Update post status based on result
  - Store platform response data (post URL, post ID)

#### API Endpoint Tests
- **POST /api/social-posts** (create)
  - Request validation
  - Authorization check
  - Database insertion
  - Response format
  
- **GET /api/social-posts** (list with filters)
  - Pagination
  - Filter by status/platform/date range
  - Sort order
  
- **PATCH /api/social-posts/:id** (update/reschedule)
  - Only allow updates for non-posted items
  - Validation on state transitions
  
- **DELETE /api/social-posts/:id** (cancel)
  - Prevent deletion of in-progress posts
  
- **POST /api/media/presigned-url** (video upload)
  - Generate valid S3 URL
  - Return correct content-type headers

#### Platform API Mocking
- **Mock server setup** for each platform
  - Success scenarios
  - Rate limit responses (429)
  - Auth failures (401)
  - Server errors (500)
  - Timeout simulations
  
- **Webhook simulation** (for platforms that callback)
  - Instagram video processing completion
  - YouTube upload processing status

### 1.3 End-to-End Tests (Target: 60% coverage)

#### Critical User Journeys
1. **Complete posting flow (happy path)**
   - Login → Upload video → Select video → Schedule post → View on calendar → Wait for execution → Verify posted status
   
2. **Multi-platform simultaneous posting**
   - Select 3 platforms → Schedule same time → Verify all execute correctly
   
3. **Reschedule before execution**
   - Create scheduled post → Edit time to different day → Verify new time is used
   
4. **Cancel scheduled post**
   - Create scheduled post → Cancel → Verify not posted at scheduled time
   
5. **Draft workflow**
   - Create draft → Save → Come back later → Schedule → Post

#### UI Component Tests (Playwright)
- **Calendar view**
  - Month navigation (prev/next)
  - Week view toggle
  - Click day to create post
  - Drag-and-drop reschedule (if implemented)
  - Visual indicators for post status (color coding)
  
- **List views**
  - Tab switching (all/scheduled/posted/drafts)
  - Filter by platform (checkboxes)
  - Sort by date
  - Infinite scroll or pagination
  
- **Schedule modal**
  - Date picker interaction
  - Time picker (hour/minute selection)
  - Timezone selector
  - Platform multi-select with icons
  - Caption editor with character counter
  - Video preview thumbnail
  - Validation error display
  
- **OAuth connection flow** (mock platforms)
  - Click "Connect Instagram" → Popup opens → Mock consent → Return with token → Show connected state

#### Cross-Browser Testing
- Chrome (primary)
- Safari (webkit differences in video handling)
- Firefox (date picker compatibility)
- Mobile responsive (calendar on small screens)

---

## 2. Edge Cases to Test

### 2.1 Timezone Handling
| Scenario | Test Case | Expected Behavior |
|----------|-----------|-------------------|
| **User in non-UTC timezone** | Schedule post for 9:00 AM local time | Stored as UTC, executes at correct local 9:00 AM |
| **DST transition** | Schedule post for 2:30 AM on DST spring-forward night | Post executes at 3:30 AM (or skip if 2:30 doesn't exist) |
| **Cross-day boundary** | Schedule at 11:59 PM, cron runs at 12:01 AM | Post executes correctly despite day rollover |
| **Timezone change mid-schedule** | User schedules in PST, moves to EST before execution | Post executes at original PST time (use UTC internally) |
| **Far future scheduling** | Schedule post 6 months out | Date stored correctly, no integer overflow |
| **Invalid timezone** | API receives unknown timezone code | Return 400 with clear error message |

### 2.2 Scheduled Posts at Boundary Times
| Scenario | Test Case | Expected Behavior |
|----------|-----------|-------------------|
| **Exactly midnight UTC** | Schedule for 00:00:00 UTC | Executes in the correct cron cycle |
| **Cron execution overlap** | Two posts scheduled 1 minute apart, cron runs every 5 min | Both execute in same cycle, no collision |
| **Past time submission** | Client sends scheduled_time in the past | Reject with validation error |
| **Concurrent scheduling** | Schedule 10 posts for same second | All execute, no database lock issues |
| **Leap second** | Schedule during rare leap second | System handles gracefully (unlikely but document) |
| **Year boundary** | Schedule for Dec 31 11:59 PM to execute in new year | Correct year used |

### 2.3 Platform API Failures
| Platform | Failure Mode | Test Case | Expected Handling |
|----------|--------------|-----------|-------------------|
| **Instagram** | 429 Rate Limit | Post 50 videos in 1 hour | Queue remaining, retry with backoff |
| **TikTok** | 401 Token Expired | Token expires mid-posting | Detect, prompt re-auth, don't lose post |
| **YouTube** | 500 Server Error | YouTube down during scheduled time | Retry 3x with exponential backoff, mark failed |
| **Twitter** | 413 Video Too Large | Video >512MB | Catch before posting, show clear error |
| **Facebook** | Network Timeout | Slow API response | Timeout after 60s, retry once, then fail |
| **LinkedIn** | 403 Permission Revoked | User revoked app access | Detect, show reconnect prompt, preserve post |
| **Pinterest** | 400 Invalid Video Format | Send non-MP4 (shouldn't happen) | Transcode catches this, but test graceful failure |
| **Threads** | 503 Service Unavailable | Threads has outage | Retry with exponential backoff up to 1 hour |
| **Bluesky** | API Schema Change | Response format changes | Catch parsing errors, log for investigation |

### 2.4 Token Expiration During Posting
| Scenario | Test | Expected |
|----------|------|----------|
| **Token expires 1 min before scheduled post** | Mock expiration time | Refresh token before posting |
| **Refresh token also expired** | Both tokens expired | Mark post as failed, prompt re-auth, allow retry after re-auth |
| **Token valid but revoked by user on platform** | User goes to Instagram and revokes app | Detect 401, show "Reconnect Instagram" message |
| **Simultaneous posts, one token refresh** | 3 platforms scheduled together, Twitter token expires | Twitter refreshes without blocking IG/TikTok |
| **Refresh fails with network error** | Network issue during refresh | Retry refresh, don't immediately fail post |

### 2.5 Large Video Handling
| Scenario | Constraints | Test Case | Expected |
|----------|-------------|-----------|----------|
| **Max file size upload** | 2GB+ video | Upload 2.5GB file | Progress bar, chunked upload, or reject upfront with message |
| **Transcode timeout** | 10-minute video | FFmpeg takes >5 minutes | Don't timeout, show processing status |
| **Out of memory** | 4K 60fps 20-minute video | Railway instance runs out of memory | Catch error, show "video too large" message |
| **Incomplete upload** | User closes browser mid-upload | Orphan cleanup job deletes file after 24h |
| **Corrupted video file** | Upload corrupted MP4 | FFmpeg fails, show error to user, don't schedule |
| **Vertical video (9:16)** | TikTok/Instagram format | Upload vertical video | Transcode preserves aspect ratio |
| **Horizontal video (16:9)** | YouTube/LinkedIn format | Upload horizontal | Works on all platforms |
| **Audio-only file** | MP3 uploaded | Validation rejects, show "video required" |

---

## 3. Regression Risks

### 3.1 Existing Features That Could Break

#### High Risk
- **Video Gallery (Chrome Extension)**
  - Risk: Shared storage/transcoding pipeline might conflict
  - Test: Verify existing gallery uploads still work
  - Test: Confirm gallery videos can be selected for social posting
  - Test: Ensure social posting doesn't delete videos still in gallery
  
- **User Authentication/Session**
  - Risk: Adding OAuth for 9 platforms might interfere with existing auth
  - Test: Login/logout still works
  - Test: Session persistence across OAuth popups
  - Test: Multiple OAuth connections don't corrupt user session
  
- **Supabase Storage Quotas**
  - Risk: New video uploads might hit 100GB Pro tier limit
  - Test: Monitor storage usage in test environment
  - Test: Verify cleanup jobs actually run and delete old files
  - Test: Alert system if nearing storage limit

#### Medium Risk
- **Railway Transcoder Resource Usage**
  - Risk: Social posting transcodes compete with existing transcoding
  - Test: Concurrent transcode handling (queue system)
  - Test: Railway instance doesn't crash under load
  - Test: Monitor CPU/memory during peak usage
  
- **Existing eBay Integration**
  - Risk: Shared database might have migration issues
  - Test: eBay listing operations unaffected
  - Test: eBay product videos still accessible
  - Test: No foreign key conflicts with new social_posts table
  
- **UI Navigation**
  - Risk: New calendar/schedule pages might break existing nav
  - Test: All existing nav links still work
  - Test: Breadcrumbs update correctly
  - Test: Mobile menu includes new sections

#### Low Risk
- **Analytics/Dashboard**
  - Risk: Minimal - isolated feature
  - Test: Quick smoke test that dashboard loads
  
- **Settings Pages**
  - Risk: Minimal unless OAuth settings added there
  - Test: Verify settings page still functional

### 3.2 Integration Points with Other Systems

| System | Integration Point | Risk | Mitigation Test |
|--------|-------------------|------|-----------------|
| **Supabase Auth** | OAuth token storage as user metadata | Medium | Test CRUD operations on auth.users don't fail |
| **Supabase Storage** | Shared video bucket with existing features | High | Test isolation - social videos don't affect gallery |
| **Railway Transcoder** | Shared FFmpeg service | High | Load test: Can it handle both workloads? |
| **Cron Service** | New scheduled job added to existing cron | Medium | Ensure other cron jobs still run (existing scheduled tasks) |
| **Database** | New tables with foreign keys to users/videos | Medium | Migration rollback test, verify constraints |
| **Frontend Router** | New routes for calendar/schedule pages | Low | Test route conflicts don't break existing pages |
| **API Gateway** | New endpoints under /api/social-posts | Low | Verify CORS, rate limiting still work |

---

## 4. Manual Testing Requirements

### 4.1 OAuth Flows (Must Be Manual)

**Why Manual?** Each platform requires real accounts, human consent, and live OAuth servers. Cannot be fully automated.

#### Instagram
- [ ] Click "Connect Instagram" button
- [ ] Popup opens to Instagram OAuth
- [ ] Login with test account (need real Instagram account)
- [ ] Grant video posting permissions
- [ ] Verify popup closes and app shows "Connected"
- [ ] Verify token stored in database (encrypted)
- [ ] Test token refresh after 50 days (or mock expiration)
- [ ] Test reconnection flow after token expires
- [ ] Test revoke and reconnect

#### TikTok
- [ ] Same flow as Instagram
- [ ] Verify specific TikTok permissions (video publish)
- [ ] Test TikTok's short token lifetime (refresh often)

#### YouTube
- [ ] Google OAuth popup
- [ ] Verify YouTube Data API v3 permissions
- [ ] Test channel selection if multiple channels
- [ ] Verify uploads go to correct channel

#### Facebook
- [ ] Facebook OAuth with page selection
- [ ] Test personal profile vs. business page posting
- [ ] Verify correct page selected and stored

#### Twitter/X
- [ ] OAuth 2.0 flow (new API)
- [ ] Verify video upload permissions
- [ ] Test tweet + video posting

#### LinkedIn
- [ ] LinkedIn OAuth
- [ ] Personal profile vs. company page
- [ ] Test video posting limits (10-minute max)

#### Pinterest
- [ ] Pinterest OAuth
- [ ] Verify board selection
- [ ] Test video pin creation

#### Threads
- [ ] Meta OAuth (similar to Instagram)
- [ ] Verify Threads-specific permissions

#### Bluesky
- [ ] App password method (not OAuth if using AT Protocol)
- [ ] Verify video blob upload
- [ ] Test post creation with video

**Test Matrix: 9 platforms × 4 scenarios (connect, refresh, revoke, reconnect) = 36 manual tests**

### 4.2 Actual Platform Posting (Need Real Accounts)

**Why Manual?** Must verify videos actually appear on platforms. Sandbox APIs don't post publicly.

#### Test Accounts Needed
- Instagram: Create test account (can use personal for dev)
- TikTok: Test account (TikTok allows test mode, but need real account for full test)
- YouTube: Test channel (can create unlisted videos)
- Facebook: Test page (private page)
- Twitter: Test account
- LinkedIn: Test profile
- Pinterest: Test board (private)
- Threads: Test account (linked to Instagram test)
- Bluesky: Test account (easy to create)

#### Manual Posting Tests
For each platform:
- [ ] Schedule post for 2 minutes in future
- [ ] Wait and verify cron picks it up
- [ ] Check platform to confirm video posted
- [ ] Verify caption, hashtags appear correctly
- [ ] Verify video plays on platform
- [ ] Confirm post URL stored in database
- [ ] Test delete/edit on platform (if supported)

**Frequency:** Full manual posting test before each major release (1x per sprint)

### 4.3 UI/UX Verification

**Why Manual?** Visual design, animation smoothness, and user experience require human judgment.

#### Calendar UI
- [ ] Visual layout matches design mockups
- [ ] Colors/icons for post status are clear and distinct
- [ ] Hover states work smoothly
- [ ] Click interactions feel responsive
- [ ] Month transitions are smooth (no flicker)
- [ ] Today's date is highlighted clearly
- [ ] Mobile responsive design works well (test on iPhone/Android)

#### Schedule Modal
- [ ] Form layout is intuitive
- [ ] Date/time pickers are easy to use
- [ ] Platform icons are clear and clickable
- [ ] Caption editor has good UX (auto-grow, character count)
- [ ] Video preview thumbnail loads quickly
- [ ] Validation errors are clear and helpful
- [ ] Submit button states (loading, disabled) are clear

#### List Views
- [ ] Tabs are clearly labeled
- [ ] Post cards are scannable (good info hierarchy)
- [ ] Filters work intuitively
- [ ] Loading states are smooth (skeletons or spinners)
- [ ] Empty states have helpful messages

#### Error States
- [ ] Failed posts are visually distinct (red indicator?)
- [ ] Error messages are user-friendly (not raw API errors)
- [ ] Retry buttons are obvious
- [ ] Reconnect prompts are clear

**Accessibility**
- [ ] Keyboard navigation works (tab through form)
- [ ] Screen reader testing (basic pass with VoiceOver)
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus indicators are visible

---

## 5. Acceptance Criteria Suggestions

### 5.1 Video Upload & Transcoding

**Definition of Done:**
- [ ] User can upload video up to 2GB via presigned URL
- [ ] Upload progress is visible and accurate
- [ ] Transcode to H.264/AAC MP4 completes within 2× video duration (10-min video = max 20-min transcode)
- [ ] Transcoded video plays on all 9 platforms without errors
- [ ] Original video is deleted after successful transcode
- [ ] Failed transcodes show clear error message to user
- [ ] Corrupted/invalid videos are rejected at upload validation

**Verification:**
- Upload 5 test videos (various sizes, formats, durations)
- Confirm all transcode successfully
- Attempt posting to 3 random platforms each
- Verify storage cleanup after 24 hours

### 5.2 Scheduling System

**Definition of Done:**
- [ ] User can schedule post for any future date/time
- [ ] Scheduled time is displayed in user's local timezone
- [ ] Stored as UTC in database (verified by DB query)
- [ ] Cron job runs every 5 minutes and picks up scheduled posts
- [ ] Posts scheduled within 5-minute window all execute
- [ ] Timezone transitions (DST) handled correctly
- [ ] Past times are rejected with validation error
- [ ] User can reschedule before execution
- [ ] User can cancel scheduled post

**Verification:**
- Schedule 20 posts across different times/days
- Verify all execute within 5 minutes of scheduled time
- Check database for UTC storage
- Test rescheduling and cancellation
- Test DST transition date (mock system clock if needed)

### 5.3 Multi-Platform Posting

**Definition of Done:**
- [ ] User can select 1-9 platforms for a single post
- [ ] Post executes to all selected platforms simultaneously (parallel)
- [ ] If one platform fails, others still succeed
- [ ] Each platform's result is tracked independently
- [ ] Platform-specific errors are displayed clearly
- [ ] User can retry failed platform without reposting successful ones
- [ ] Video meets each platform's requirements (format, size, duration)

**Verification:**
- Schedule single post to all 9 platforms
- Mock one platform failure (e.g., TikTok returns 500)
- Verify 8 succeed, 1 fails, user sees clear status
- Retry failed platform, verify doesn't repost to successful 8

### 5.4 OAuth Integration

**Definition of Done:**
- [ ] All 9 platforms have working OAuth connection flows
- [ ] OAuth happens in popup window (doesn't leave app)
- [ ] Connected state is persisted and visible in UI
- [ ] Tokens are encrypted in database
- [ ] Token refresh happens automatically before expiration
- [ ] Expired tokens prompt re-authentication without losing scheduled posts
- [ ] User can disconnect and reconnect each platform independently

**Verification:**
- Connect all 9 platforms manually
- Verify encrypted tokens in database
- Mock token expiration, verify refresh logic
- Disconnect and reconnect one platform
- Verify scheduled posts don't break during reconnection

### 5.5 Calendar & List UI

**Definition of Done:**
- [ ] Calendar shows month and week views
- [ ] Posts are color-coded by status (draft, scheduled, posted, failed)
- [ ] Clicking a day opens schedule modal
- [ ] List views filter by status (all/scheduled/posted/drafts)
- [ ] Pagination or infinite scroll handles 1000+ posts
- [ ] Mobile responsive (works on phone screens)
- [ ] Loading states are smooth
- [ ] Empty states have helpful messages

**Verification:**
- Create 100 test posts across various dates/statuses
- Navigate calendar (month/week views)
- Test all list view filters
- Test on mobile device (real phone, not just Chrome DevTools)
- Verify performance (no lag with 100 posts visible)

### 5.6 Error Handling & Retry

**Definition of Done:**
- [ ] Failed posts are marked with clear "failed" status
- [ ] Error message from platform is translated to user-friendly text
- [ ] User can retry failed post without re-entering data
- [ ] Retry uses exponential backoff (3 attempts: immediate, 5min, 15min)
- [ ] After 3 failures, post marked as "permanently failed"
- [ ] User is notified of failures (in-app notification or email)
- [ ] Failed posts don't block other scheduled posts

**Verification:**
- Mock 5 different platform errors (401, 429, 500, timeout, network)
- Verify each shows appropriate user message
- Test retry logic with exponential backoff
- Verify notifications sent for failures
- Confirm other posts execute during retries

---

## 6. Test Environment Needs

### 6.1 Sandbox Accounts for Platforms

| Platform | Sandbox Available? | Setup Required | Notes |
|----------|-------------------|----------------|-------|
| **Instagram** | ❌ No official sandbox | Use test account | Create private IG account for testing |
| **TikTok** | ✅ Yes (limited) | Developer account + test app | Videos don't go public in test mode |
| **YouTube** | ✅ Yes (unlisted) | Create test channel | Use unlisted visibility for test videos |
| **Facebook** | ✅ Yes (test pages) | Create test page | Posts only visible to testers |
| **Twitter** | ❌ No sandbox | Use test account with protected tweets | Set account to protected mode |
| **LinkedIn** | ❌ No sandbox | Use test profile | Create secondary LinkedIn for testing |
| **Pinterest** | ❌ No sandbox | Use test account with private board | Posts only visible if board is private |
| **Threads** | ❌ No sandbox | Use test account | Create private Threads account |
| **Bluesky** | ✅ Yes (own server) | Can run own Bluesky PDS | Or use test account on main server |

**Recommendation:**
- Create dedicated test accounts for all 9 platforms
- Use private/protected settings where possible
- Label all test posts clearly: "TEST - DO NOT INTERACT"
- Delete test posts weekly to avoid clutter

### 6.2 Avoiding Spam on Real Accounts

#### Strategy 1: Mock Platform APIs in Test Environment
- **Setup:** Run mock API servers for each platform
- **Benefit:** Tests run without hitting real platforms
- **Coverage:** Good for integration tests, unit tests
- **Limitation:** Doesn't verify actual posting works

#### Strategy 2: Test Account Pool
- **Setup:** 2-3 test accounts per platform (18-27 accounts total)
- **Benefit:** Real platform testing without spamming personal accounts
- **Coverage:** Manual QA, E2E tests
- **Limitation:** Time to set up, ongoing maintenance

#### Strategy 3: Delayed Execution in Staging
- **Setup:** Staging environment where cron jobs don't auto-execute
- **Benefit:** Can test scheduling UI without actually posting
- **Coverage:** UI/UX testing, scheduling logic
- **Limitation:** Must manually trigger posting for true E2E test

#### Strategy 4: "Dry Run" Mode
- **Setup:** Environment variable `DRY_RUN=true` that skips actual API calls
- **Benefit:** Test full flow without posting
- **Coverage:** Pre-production verification
- **Limitation:** Doesn't catch platform API changes

**Recommended Approach:**
Combine all 4 strategies:
1. **Unit/Integration Tests:** Mock APIs (Strategy 1)
2. **Automated E2E Tests:** Dry run mode + mock APIs (Strategies 1 & 4)
3. **Manual QA:** Test account pool (Strategy 2)
4. **Pre-Release Verification:** Real test accounts with manual trigger (Strategy 3)

### 6.3 Test Environment Setup Checklist

#### Infrastructure
- [ ] Staging environment on Railway (separate from production)
- [ ] Staging Supabase project (separate database and storage)
- [ ] Separate OAuth apps for each platform (staging credentials)
- [ ] Mock API server for platform simulation
- [ ] Cron job that can be manually triggered (for testing scheduling)

#### Data
- [ ] Seed database with test user accounts
- [ ] Sample videos (various formats, sizes, durations) in test storage
- [ ] Sample posts in all states (draft, scheduled, posted, failed)
- [ ] Expired OAuth tokens (for testing refresh logic)

#### Accounts
- [ ] 18-27 test accounts across 9 platforms (2-3 per platform)
- [ ] Document credentials in secure password manager
- [ ] Label accounts clearly as "TEST ACCOUNT - ebay-price-reducer"
- [ ] Set up test accounts as "private" or "protected" where possible

#### Monitoring
- [ ] Error logging (Sentry or similar) for staging environment
- [ ] Storage usage monitoring (alert if > 90GB on Supabase)
- [ ] Railway resource monitoring (CPU, memory, disk)
- [ ] Cron job execution logs (verify jobs run on schedule)

#### Documentation
- [ ] How to trigger cron job manually for testing
- [ ] How to mock platform API responses
- [ ] How to reset test database to clean state
- [ ] How to add new test accounts
- [ ] OAuth app setup guide for each platform

---

## 7. Testing Timeline & Prioritization

### Phase 1: Foundation (Week 1) - 16 hours
**Priority: Critical**
- Set up test environment (staging, test accounts, mock APIs)
- Write unit tests for video transcoding logic
- Write unit tests for scheduling logic and timezone handling
- Write integration tests for database operations

### Phase 2: Platform Integration (Week 2) - 12 hours
**Priority: High**
- Write unit tests for all 9 platform adapters
- Create mock API servers for integration tests
- Write integration tests for OAuth flows (mocked)
- Test platform-specific error handling

### Phase 3: E2E & UI (Week 3) - 12 hours
**Priority: High**
- Playwright tests for calendar UI
- Playwright tests for schedule modal
- Playwright tests for list views
- Cross-browser testing (Chrome, Safari, Firefox)

### Phase 4: Manual QA (Week 4) - 10 hours
**Priority: High**
- Manual OAuth testing for all 9 platforms
- Manual posting verification (real accounts)
- Edge case testing (timezone, boundaries, large videos)
- UI/UX verification and accessibility

### Phase 5: Regression & Performance (Ongoing) - 6 hours
**Priority: Medium**
- Regression tests for existing features
- Load testing (transcoding, cron jobs)
- Storage monitoring and cleanup verification
- Performance testing (UI with 1000+ posts)

**Total: ~56 hours across 4 weeks**

---

## 8. Risk Mitigation Summary

| Risk Category | Impact | Likelihood | Mitigation |
|---------------|--------|------------|------------|
| **Platform API changes** | High | Medium | Comprehensive error logging, graceful degradation, version all platform integrations |
| **OAuth token issues** | High | Medium | Proactive refresh, clear re-auth prompts, retry logic |
| **Transcoding failures** | Medium | Medium | Validate upfront, timeout handling, show clear errors |
| **Timezone bugs** | Medium | Low | Extensive unit tests, use battle-tested libraries (Luxon, date-fns) |
| **Storage quota exceeded** | High | Low | Automated cleanup jobs, storage monitoring, alerts |
| **Regression in existing features** | High | Low | Comprehensive regression test suite, integration tests |
| **Performance degradation** | Medium | Low | Load testing, resource monitoring, optimize queries |
| **Security (OAuth tokens)** | Critical | Very Low | Encryption at rest, HTTPS only, regular security audits |

---

## 9. Recommended Testing Tools

### Automated Testing
- **Vitest** - Unit tests (fast, modern, TypeScript support)
- **Playwright** - E2E tests (cross-browser, reliable)
- **MSW (Mock Service Worker)** - API mocking for integration tests
- **Testcontainers** - Spin up Supabase/Postgres for integration tests

### Manual Testing
- **BrowserStack** - Cross-browser/device testing (if budget allows)
- **Charles Proxy** - Inspect OAuth flows and platform API calls
- **Postman/Insomnia** - Manual API testing during development

### Monitoring & Debugging
- **Sentry** - Error tracking in production
- **LogRocket** - Session replay for UI bugs
- **Supabase Dashboard** - Monitor database and storage usage
- **Railway Logs** - Track cron job execution and FFmpeg output

---

## 10. Open Questions for Product/Dev Team

1. **Notification Strategy:** How should users be notified of failed posts? In-app only, or email/push?
2. **Retry Limits:** After 3 auto-retries fail, should the system auto-cancel the post or keep it in "failed" state indefinitely?
3. **Draft Auto-Save:** Should drafts auto-save as user types, or only on explicit "Save Draft"?
4. **Multi-User Future:** Even though out of scope now, should we design database schema to support multi-user later?
5. **Platform Priority:** If testing is time-limited, which 3-5 platforms are most critical to test thoroughly?
6. **Rate Limit Strategy:** If hitting platform rate limits, should posts queue or fail immediately?
7. **Video Retention:** 30-day retention policy mentioned - should successful posts keep video forever, or delete after 30 days regardless?

---

## 11. Success Metrics

To consider this feature fully tested and ready for production:

- ✅ **90%+ automated test coverage** (unit + integration)
- ✅ **All 9 platforms successfully post** in manual QA
- ✅ **Zero regressions** in existing features
- ✅ **50+ scheduled posts tested** without failures
- ✅ **All edge cases documented** and tested
- ✅ **Performance benchmarks met** (calendar loads <2s with 100 posts, transcode <2× video duration)
- ✅ **Security audit passed** (OAuth tokens encrypted, no sensitive data logged)
- ✅ **Staging environment stable** for 1 week without crashes

---

**QA Agent Assessment Complete**  
*This is a complex, high-risk feature that will require significant testing effort. The 40-50 hour testing estimate is realistic given 9 platform integrations, OAuth complexity, and background processing requirements. Priority should be foundation (transcoding, scheduling, DB) before moving to platform-specific testing.*

**Next Steps:**
1. Review this assessment with dev team
2. Prioritize which platforms to test first (suggest starting with YouTube, Instagram, TikTok as most popular)
3. Set up test environment and accounts
4. Begin Phase 1 testing alongside development

---
*Generated: 2026-01-23 by QA Agent*
