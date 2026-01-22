# Impact Assessment: Amazon Influencer Chrome Extension

## Overview
Building a Chrome extension to accelerate Amazon Influencer video uploads with autofill capabilities.

---

## Frontend Impact

### New Files Required
```
projects/ebay-price-reducer/chrome-extension/
├── manifest.json              # Extension config (Manifest V3)
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── sidepanel/
│   ├── index.html            # Side panel UI
│   ├── sidepanel.js          # Side panel logic
│   └── sidepanel.css         # Styling
├── content/
│   └── amazon-autofill.js    # Content script for Amazon pages
├── background/
│   └── service-worker.js     # Background service worker
└── lib/
    └── api.js                # API communication helpers
```

### Existing Code Changes
- None required for MVP (extension is standalone)

### Dependencies
- No external dependencies for MVP
- Uses Chrome Extension APIs only

### Effort Estimate
- **Scaffold + Manifest:** 2 hours
- **Side Panel UI:** 8 hours
- **Content Script:** 6 hours
- **Service Worker:** 2 hours
- **Integration/Polish:** 4 hours
- **Total Frontend:** ~22 hours

---

## Backend Impact

### API Changes Needed

**Existing endpoint to verify/enhance:**
- `GET /influencer-tasks` - Fetch task queue
  - May need: pagination params (`limit`, `offset`)
  - May need: filter by status (`pending`, `completed`)

**New endpoint needed:**
- `PATCH /influencer-tasks/:id` - Update task status
  - Body: `{ status: "completed" }`
  - Returns: updated task

### Database Changes
- Verify `influencer_upload_tasks` table has `status` column
- If not, add migration with values: `pending`, `in_progress`, `completed`

### Auth Flow
- Extension uses existing Supabase JWT auth
- User logs into extension with same credentials as web app
- Token stored in `chrome.storage.local`

### Effort Estimate
- **API endpoint work:** 1-2 hours
- **Schema verification:** 30 min
- **Total Backend:** ~2 hours

---

## QA/Testing Impact

### Test Scenarios Required
1. **Extension loads correctly**
   - Side panel opens on click
   - UI renders task list

2. **Auth flow**
   - Login with valid credentials succeeds
   - Token persists across browser restart
   - Invalid credentials show error

3. **Task queue**
   - Tasks load from API
   - Displays ASIN, product title, video info
   - Empty state when no tasks

4. **Autofill functionality**
   - Navigate to Amazon Influencer upload page
   - Click "Autofill" fills title field
   - ASIN displayed for manual entry

5. **Mark complete**
   - Clicking complete updates status
   - Task moves to completed section or disappears

### Test Environment
- Chrome browser (v114+)
- Developer mode extension loading
- Amazon Influencer account for testing
- Test tasks in database

### Effort Estimate
- **Manual testing:** 4-6 hours
- **Total QA:** ~5 hours

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Amazon DOM structure unknown | High | Medium | Inspect page first, use flexible selectors |
| Content script blocked by Amazon | Low | High | Test early, fallback to manual copy |
| Chrome API changes | Low | Low | Use stable APIs, Manifest V3 |
| Auth token expiry | Medium | Low | Handle refresh, prompt re-login |

---

## Dependencies & Prerequisites

### Before Development
- [ ] Verify Amazon Influencer upload page DOM structure
- [ ] Confirm `/influencer-tasks` API exists and returns needed data
- [ ] Confirm database has task status field

### Before Testing
- [ ] Have test tasks in database with ASINs
- [ ] Have Amazon Influencer account access
- [ ] Chrome 114+ browser

---

## Total Effort Summary

| Domain | Hours |
|--------|-------|
| Frontend (Extension) | 22 |
| Backend (API) | 2 |
| QA (Testing) | 5 |
| **Total** | **~29 hours** |

**Timeline:** ~1 week with focused effort

---

## Recommendation

✅ **Proceed with implementation**

Low risk, well-defined scope, minimal backend changes needed. Extension architecture is straightforward Manifest V3 pattern.

**Critical path:**
1. First verify Amazon page DOM structure
2. Then build extension scaffold
3. Then implement side panel + content script
4. Then test on real Amazon page

---

*Assessment created: 2026-01-21*
*Status: Ready for /plan*
