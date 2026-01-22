# Implementation Plan: YouTube Integration

## Task Breakdown

### Task 1: Database Schema (Backend)
**Agent:** backend
**Effort:** 30 min

Create tables for social connections and posting:
- `social_connections` - OAuth token storage
- `posting_schedules` - User's posting preferences  
- `scheduled_posts` - Post queue and history

**Acceptance Criteria:**
- [ ] Migration file created and applied
- [ ] Tables exist in Supabase with correct columns
- [ ] RLS policies allow users to manage their own data

---

### Task 2: YouTube OAuth Flow (Backend)
**Agent:** backend
**Effort:** 1-2 hours

Create OAuth endpoints:
- `/api/youtube/auth` - Generate OAuth URL and redirect
- `/api/youtube/callback` - Handle callback, store tokens
- `/api/youtube/status` - Return connection status
- `/api/youtube/disconnect` - Remove connection

**Acceptance Criteria:**
- [ ] User can initiate OAuth flow
- [ ] Callback correctly exchanges code for tokens
- [ ] Tokens stored securely in social_connections
- [ ] Status endpoint returns channel info
- [ ] Disconnect removes tokens

---

### Task 3: YouTube Posting Service (Backend)
**Agent:** backend
**Effort:** 1-2 hours

Create video upload functionality:
- Download video from OneDrive URL
- Upload to YouTube via resumable upload API
- Set title, description, privacy
- Store result in scheduled_posts

**Acceptance Criteria:**
- [ ] Can upload a video to YouTube
- [ ] Video appears as a Short (vertical, <60s)
- [ ] Title and description set correctly
- [ ] Upload status tracked in database

---

### Task 4: Scheduled Posting Job (Backend)
**Agent:** backend  
**Effort:** 1 hour

Create scheduled function:
- Runs hourly
- Finds videos due for posting
- Calls posting service
- Updates status (success/failed)
- Handles retries

**Acceptance Criteria:**
- [ ] Scheduled function runs on schedule
- [ ] Posts videos at configured time
- [ ] Handles errors gracefully
- [ ] Updates post status

---

### Task 5: Token Refresh Job (Backend)
**Agent:** backend
**Effort:** 30 min

Create token refresh mechanism:
- Check tokens expiring within 7 days
- Refresh using refresh_token
- Update stored tokens

**Acceptance Criteria:**
- [ ] Tokens refreshed before expiry
- [ ] Failed refreshes logged/alerted

---

### Task 6: Settings UI - YouTube Connection (Frontend)
**Agent:** frontend
**Effort:** 1 hour

Add to Settings/Account page:
- "Social Connections" section
- "Connect YouTube" button
- Connected state showing channel name
- "Disconnect" button

**Acceptance Criteria:**
- [ ] Connect button initiates OAuth
- [ ] After connection, shows channel name
- [ ] Disconnect button removes connection
- [ ] Loading states during OAuth

---

### Task 7: Settings UI - Posting Schedule (Frontend)
**Agent:** frontend
**Effort:** 30 min

Add schedule configuration:
- Time picker for daily post time
- Timezone dropdown
- Enable/disable toggle

**Acceptance Criteria:**
- [ ] User can set posting time
- [ ] Timezone selection works
- [ ] Can enable/disable posting
- [ ] Settings persist on save

---

### Task 8: Post History View (Frontend)
**Agent:** frontend
**Effort:** 1 hour

Show posting history:
- List of posts (pending, posted, failed)
- Status indicators with icons
- Link to YouTube video if posted
- Retry button for failures

**Acceptance Criteria:**
- [ ] Shows all posts with status
- [ ] Posted videos link to YouTube
- [ ] Can retry failed posts
- [ ] Pagination if needed

---

### Task 9: End-to-End Testing (QA)
**Agent:** qa
**Effort:** 1 hour

Test complete flow:
- OAuth connection
- Schedule configuration
- Manual post trigger
- Scheduled post execution
- Error handling

**Acceptance Criteria:**
- [ ] Full flow works end-to-end
- [ ] Error cases handled gracefully
- [ ] UI updates correctly
- [ ] No regressions

---

## Task Sequence

```
1. Database Schema ──────────────┐
                                 │
2. OAuth Flow ───────────────────┼──► 6. Settings UI (Connection)
                                 │
3. Posting Service ──────────────┤
                                 │
4. Scheduled Job ────────────────┼──► 7. Settings UI (Schedule)
                                 │
5. Token Refresh ────────────────┘    8. Post History
                                           │
                                           ▼
                                      9. E2E Testing
```

## Prerequisites (Pete Action Required)
Before starting implementation:

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com
   - Create new project (e.g., "eBay Price Reducer")

2. **Enable YouTube Data API v3**
   - APIs & Services > Enable APIs
   - Search "YouTube Data API v3" > Enable

3. **Configure OAuth Consent Screen**
   - OAuth consent screen > External
   - Add scopes: `youtube.upload`, `youtube.readonly`
   - Add test users (your email)

4. **Create OAuth Credentials**
   - Credentials > Create > OAuth client ID
   - Web application
   - Redirect URI: `https://dainty-horse-49c336.netlify.app/.netlify/functions/youtube-callback`
   - Copy Client ID and Client Secret

5. **Provide credentials to Clawd**
   - Client ID
   - Client Secret

---

## Estimated Timeline
- Backend tasks (1-4): ~4 hours
- Frontend tasks (6-8): ~2.5 hours
- Testing (9): ~1 hour
- **Total: ~1 day of work**

---
*Created: 2026-01-22*
*Status: Ready for Implementation*
