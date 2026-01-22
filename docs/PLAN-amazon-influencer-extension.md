# Implementation Plan: Amazon Influencer Chrome Extension

## Overview
Build Chrome extension MVP for accelerating Amazon Influencer video uploads.

---

## Task Breakdown

### Phase 1: Foundation (Day 1)

#### Task 1.1: Verify Amazon DOM Structure
**Agent:** QA  
**Effort:** 1 hour  
**Description:** Inspect Amazon Influencer video upload page to document form field selectors.

**Acceptance Criteria:**
- [ ] Document title input field selector
- [ ] Document "Tag Products" button selector  
- [ ] Document ASIN input field selector (in modal)
- [ ] Screenshot of form structure captured
- [ ] Selectors validated as reliable

---

#### Task 1.2: Verify Backend API
**Agent:** Backend  
**Effort:** 1 hour  
**Description:** Confirm `/influencer-tasks` endpoint exists and returns needed data structure.

**Acceptance Criteria:**
- [ ] API endpoint accessible
- [ ] Returns task list with: id, asin, product_title, video_url, status
- [ ] Supports status filtering
- [ ] Document any gaps or needed modifications

---

#### Task 1.3: Create Extension Scaffold
**Agent:** Frontend  
**Effort:** 2 hours  
**Description:** Create base Chrome extension structure with Manifest V3.

**Acceptance Criteria:**
- [ ] `chrome-extension/` folder created
- [ ] `manifest.json` with correct permissions
- [ ] Basic side panel loads (placeholder content)
- [ ] Service worker registered
- [ ] Extension loads in developer mode without errors
- [ ] Icons created (can be placeholders)

**Files:**
```
chrome-extension/
├── manifest.json
├── icons/
├── sidepanel/index.html
├── background/service-worker.js
```

---

### Phase 2: Core Features (Day 2-3)

#### Task 2.1: Side Panel UI - Auth
**Agent:** Frontend  
**Effort:** 3 hours  
**Description:** Build login UI for extension that authenticates with Supabase.

**Acceptance Criteria:**
- [ ] Login form with email/password
- [ ] Successful login stores JWT token
- [ ] Token persists in chrome.storage.local
- [ ] Logged-in state shows user info
- [ ] Logout functionality works
- [ ] Error handling for invalid credentials

---

#### Task 2.2: Side Panel UI - Task Queue
**Agent:** Frontend  
**Effort:** 5 hours  
**Description:** Build task queue display showing pending upload tasks.

**Acceptance Criteria:**
- [ ] Fetches tasks from API using stored token
- [ ] Displays task list with:
  - ASIN
  - Product title (truncated if long)
  - Status indicator
- [ ] "Autofill" button per task
- [ ] "Mark Complete" button per task
- [ ] Empty state when no tasks
- [ ] Loading state while fetching
- [ ] Error state if API fails
- [ ] Pull-to-refresh or refresh button

---

#### Task 2.3: Content Script - Title Autofill
**Agent:** Frontend  
**Effort:** 4 hours  
**Description:** Create content script that fills Amazon form title field.

**Acceptance Criteria:**
- [ ] Content script injects on Amazon Influencer pages
- [ ] Receives autofill command from side panel
- [ ] Locates title input field
- [ ] Sets value to "Product Review" 
- [ ] Dispatches input/change events for React state
- [ ] Adds humanized typing delay (50-150ms)
- [ ] Reports success/failure back to side panel

---

#### Task 2.4: Content Script - ASIN Display
**Agent:** Frontend  
**Effort:** 2 hours  
**Description:** Display ASIN prominently so user can copy/enter manually.

**Acceptance Criteria:**
- [ ] ASIN shown in side panel for selected task
- [ ] "Copy ASIN" button copies to clipboard
- [ ] Visual feedback on copy success
- [ ] (MVP: User manually enters ASIN in Amazon form)

---

### Phase 3: Backend Support (Day 2)

#### Task 3.1: Status Update Endpoint
**Agent:** Backend  
**Effort:** 1 hour  
**Description:** Create or verify endpoint for updating task status.

**Acceptance Criteria:**
- [ ] `PATCH /influencer-tasks/:id` endpoint works
- [ ] Accepts `{ status: "completed" }` body
- [ ] Returns updated task
- [ ] Validates user owns the task (RLS)
- [ ] 404 for non-existent task
- [ ] 401 for unauthenticated requests

---

### Phase 4: Integration & Polish (Day 4)

#### Task 4.1: End-to-End Flow
**Agent:** Frontend  
**Effort:** 3 hours  
**Description:** Wire up complete flow from side panel to content script.

**Acceptance Criteria:**
- [ ] Click "Autofill" in side panel
- [ ] Content script fills title on Amazon page
- [ ] Side panel shows success feedback
- [ ] Click "Mark Complete" updates status
- [ ] Task removed/moved in UI

---

#### Task 4.2: Error Handling & Edge Cases
**Agent:** Frontend  
**Effort:** 2 hours  
**Description:** Handle edge cases and improve robustness.

**Acceptance Criteria:**
- [ ] Handle: not on Amazon page
- [ ] Handle: form not found
- [ ] Handle: API timeout
- [ ] Handle: token expired (prompt re-login)
- [ ] User-friendly error messages

---

### Phase 5: Testing & QA (Day 5)

#### Task 5.1: Full QA Testing
**Agent:** QA  
**Effort:** 4 hours  
**Description:** Test complete extension flow on real Amazon page.

**Acceptance Criteria:**
- [ ] Extension installs without errors
- [ ] Login flow works
- [ ] Task queue loads
- [ ] Autofill works on Amazon page
- [ ] Mark complete updates database
- [ ] No console errors
- [ ] Works after browser restart
- [ ] Test with 0, 1, 10 tasks

---

## Summary

| Phase | Tasks | Effort |
|-------|-------|--------|
| Foundation | 3 | 4h |
| Core Features | 4 | 14h |
| Backend | 1 | 1h |
| Integration | 2 | 5h |
| QA | 1 | 4h |
| **Total** | **11 tasks** | **~28 hours** |

---

## Agent Assignments

| Agent | Tasks |
|-------|-------|
| Frontend | 1.3, 2.1, 2.2, 2.3, 2.4, 4.1, 4.2 |
| Backend | 1.2, 3.1 |
| QA | 1.1, 5.1 |

---

## Critical Path

```
1.1 Verify DOM ─┬─► 2.3 Content Script
                │
1.2 Verify API ─┼─► 2.2 Task Queue
                │
1.3 Scaffold ───┴─► 2.1 Auth ─► 2.2 ─► 4.1 Integration ─► 5.1 QA
```

**Blockers:**
- Can't build content script (2.3) without knowing DOM structure (1.1)
- Can't build task queue (2.2) without verified API (1.2)

---

## Ready for /implement

Start with parallel execution:
- QA: Task 1.1 (verify DOM)
- Backend: Task 1.2 (verify API)  
- Frontend: Task 1.3 (scaffold)

---

*Plan created: 2026-01-21*
*Status: Ready for implementation*
