# Amazon Influencer Chrome Extension Analysis

## Executive Summary
A Chrome extension to accelerate Amazon Influencer video uploads is **technically viable and low-risk** with proper human-in-loop design. Our existing backend infrastructure is **95% ready** - minimal work needed. Estimated effort: **2-3 weeks** total, with MVP achievable in **1 week**.

## Problem Statement
Uploading videos to Amazon Influencer is manual and repetitive:
1. Navigate to upload page
2. Select video file
3. Type title
4. Click "Tag Products" → search/enter ASIN
5. Submit

For high-volume uploaders, this is tedious. A companion Chrome extension can pre-fill form data while keeping human in the loop (compliance-friendly).

## Current State
- Upload tasks exist in our eBay Price Reducer app (ASIN + video correlation)
- `/influencer-tasks` API endpoint already exists and functional
- Supabase JWT authentication ready
- No automation currently - fully manual process

---

## Proposed Approaches

### Option A: Side Panel + Content Script (RECOMMENDED)
**Description:** Chrome side panel shows task queue, content script autofills Amazon forms

**Architecture:**
```
┌─────────────────────────────────────────────┐
│  Chrome Side Panel (persistent)             │
│  - Task queue list                          │
│  - "Autofill" button per task               │
│  - Status indicators                        │
└──────────────────┬──────────────────────────┘
                   │ message passing
┌──────────────────▼──────────────────────────┐
│  Content Script (Amazon Influencer page)    │
│  - Receives autofill commands               │
│  - Fills title input                        │
│  - Triggers ASIN tagging modal              │
└─────────────────────────────────────────────┘
```

**Pros:**
- Side panel stays open while working (best UX)
- Clear separation of concerns
- User sees queue and progress at all times
- Human always in control (compliance-safe)

**Cons:**
- Requires Chrome 114+ (side panel API)
- Slightly more complex architecture

**Effort:** M (2-3 weeks)
**Risk:** Low

### Option B: Popup + Content Script
**Description:** Traditional popup window for queue, content script for autofill

**Pros:**
- Simpler architecture
- Works on all Chrome versions

**Cons:**
- Popup closes when clicking elsewhere
- Worse UX for repetitive tasks
- Have to reopen popup each time

**Effort:** S (1-2 weeks)
**Risk:** Low

### Option C: Injected Panel on Amazon Page
**Description:** Inject a floating panel directly onto Amazon's page

**Pros:**
- Everything in one view
- No popup/panel management

**Cons:**
- More fragile (Amazon DOM changes break it)
- Visually intrusive
- Harder to maintain

**Effort:** M (2-3 weeks)
**Risk:** Medium (maintenance burden)

---

## Technical Considerations

### Frontend (Chrome Extension)

**Manifest V3 Requirements:**
- Service worker (not background page)
- `sidePanel` permission for side panel
- `activeTab` + host permissions for Amazon
- `storage` for caching tasks/auth

**Permissions Needed:**
```json
{
  "permissions": ["sidePanel", "storage", "activeTab"],
  "host_permissions": ["https://*.amazon.com/*"]
}
```

**UI Components:**
- Task queue list with ASIN, title, video thumbnail, status
- "Autofill" button per task
- "Mark Complete" action
- Connection status indicator
- Login/auth flow

**Communication Pattern:**
```
Side Panel ──(chrome.runtime.sendMessage)──► Content Script
Content Script ──(response)──► Side Panel
```

### Backend

**Good News:** Existing infrastructure handles 95% of needs!

**Already Done:**
- ✅ `/influencer-tasks` API endpoint exists
- ✅ Supabase JWT authentication
- ✅ Task data model with video metadata
- ✅ RLS policies for security

**MVP Backend Work (1-2 hours):**
1. Add pagination to existing endpoint
2. Status update endpoint (pending → completed)

**Optional Enhancements:**
| Feature | Effort | Priority |
|---------|--------|----------|
| `in_progress` status for multi-user | 2 hours | Phase 2 |
| AI-powered title generation | 3 hours | Phase 3 |
| Task claiming/locking | 2 hours | Phase 2 |

### Integration (Amazon Page Interaction)

**Title Autofill (LOW RISK ✅):**
- Find input by selector/attributes
- Set value + dispatch input/change events
- Add 50-150ms typing delays for naturalness

**ASIN Tagging (MEDIUM RISK ⚠️):**
- Click "Tag Products" button
- Wait for modal (MutationObserver)
- Enter ASIN in search
- Select product from results
- Requires careful timing and humanization

**What We CANNOT Automate:**
- ❌ Video file selection (browser security prevents this)
- ❌ Form submission (keep human in loop)
- ❌ CAPTCHA solving

**Compliance Strategy:**
- Extension acts like a password manager (filling fields)
- Human selects video file manually
- Human clicks Submit manually
- Add randomized delays between actions
- Never do rapid-fire automation

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Amazon DOM changes | Medium | Medium | Use flexible selectors, maintain fallbacks |
| Account flagging | Low | High | Human-in-loop, no rapid automation |
| Chrome Web Store rejection | Low | Low | Start with developer mode, clear privacy policy |
| Multi-user conflicts | Low | Medium | Add task claiming in Phase 2 |

---

## Phases & Effort Estimates

### Phase 1: MVP (1 week)
- Side panel with task queue
- Title autofill only
- Manual ASIN entry (extension just shows it)
- Mark complete functionality
- Developer mode distribution

**Effort:** ~40 hours total
- Frontend (extension): 30 hours
- Backend: 2 hours
- Testing: 8 hours

### Phase 2: Enhanced (1 week)
- ASIN autofill (with humanized delays)
- Multi-user task claiming
- Better status tracking
- Chrome Web Store listing (unlisted)

**Effort:** ~30 hours

### Phase 3: Polish (3-5 days)
- AI-generated titles
- Thumbnail support
- Analytics/reporting
- Public listing (if desired)

**Effort:** ~20 hours

---

## Open Questions for Pete

1. **Single user or multi-user?** 
   - If just one helper, MVP is simpler
   - If multiple helpers, need task claiming logic

2. **Title generation strategy?**
   - Use product title as-is?
   - Simple template: "[Product Name] Review"?
   - AI-generated titles (more work)?

3. **Distribution preference?**
   - Developer mode only (simplest)
   - Unlisted Chrome Web Store (easy install)
   - Public listing (most polish required)

4. **Timeline priority?**
   - Fast MVP for testing, or
   - Full-featured first release?

---

## Recommendation

**Go with Option A (Side Panel + Content Script)** because:
1. Best UX for repetitive tasks
2. Our backend is already ready
3. Low compliance risk with human-in-loop
4. Can ship MVP in ~1 week

**Suggested approach:**
1. Start with title-only autofill (safest)
2. Add ASIN autofill after validating the flow works
3. Keep human clicking Submit always
4. Use developer mode until workflow is proven

---

## Next Steps (if approved)

1. **Validate Amazon DOM** - Inspect the actual form structure
2. **Create extension scaffold** - Manifest V3, side panel, content script
3. **Build task queue UI** - Connect to existing API
4. **Implement title autofill** - Test on real Amazon page
5. **Add ASIN autofill** - With humanization delays
6. **QA testing** - Full workflow verification

---

*Analysis created: 2026-01-21*  
*Status: Ready for Review*
*Agents consulted: Frontend, Backend, Integration*
