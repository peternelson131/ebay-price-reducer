# Review Document: Amazon Influencer Chrome Extension

## Request Summary
Build a Chrome extension that displays upload tasks from our app and allows rapid autofill of Amazon Influencer video upload forms. The extension shows queued tasks (ASIN + video + title), and with one click can pre-fill form fields while keeping human in the loop for compliance.

## Core Objective
Accelerate Amazon Influencer video uploads by automating form data entry while preserving human oversight (compliance-friendly).

## Scope

### In Scope (Phase 1 - MVP)
- Chrome extension with Side Panel UI
- Task queue display (from existing backend API)
- Title autofill functionality
- ASIN display (manual entry by user initially)
- Mark task as complete
- Developer mode distribution

### In Scope (Phase 2 - Enhanced)
- ASIN autofill with humanized delays
- Multi-user task claiming (if needed)
- Chrome Web Store listing (unlisted)

### Out of Scope (Future)
- Thumbnail generation/selection (noted for Phase 3)
- AI-generated titles (Phase 3)
- Full automation / auto-submit (never - compliance risk)
- Video file auto-selection (browser security prevents this)

### Assumptions
- Extension will live in `chrome-extension/` folder within eBay Price Reducer project
- Single helper user initially (can add multi-user later if needed)
- Using existing `/influencer-tasks` API endpoint
- Supabase JWT auth for extension authentication
- Chrome 114+ required (for side panel API)

## Relevant Context

### Past Work
- `/influencer-tasks` API already exists (per backend agent analysis)
- OneDrive video integration in progress (related but separate)
- Memory 2026-01-20: Chrome extension concept already discussed

### Applicable Lessons
- `lessons/testing.md` - Test all field combinations, edge cases
- `lessons/oauth-patterns.md` - Auth flow patterns (relevant for extension auth)
- `lessons/code-cleanup.md` - UI changes require frontend agent, test full flows
- `lessons/verification-failures.md` - Always verify with browser, not just API

## Agents Needed
| Agent | Responsibility |
|-------|----------------|
| `frontend` | Chrome extension scaffold, side panel UI, content scripts |
| `backend` | Add pagination to API, status update endpoint |
| `qa` | Test extension on real Amazon pages |

## Open Questions for Pete

Before I proceed to /assess, I need clarification on:

1. **Single user or multi-user?**
   - One helper using the extension, or multiple?
   - (Affects whether we need task claiming/locking)

2. **Title strategy for MVP?**
   - Use product title exactly as stored?
   - Simple template like "[Product Name] Review"?
   - (AI titles can come later)

3. **Timeline priority?**
   - Fast MVP to test workflow (1 week), or
   - More polished first release (2-3 weeks)?

---

*Review created: 2026-01-21*
*Status: Awaiting answers to proceed*
