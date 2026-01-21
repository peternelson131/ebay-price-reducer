# Impact Assessment: Video-ASIN Correlation + Multi-Marketplace Dubbing

## Objective (from Review)
Link uploaded videos to approved ASIN correlation tasks, enable per-language dubbing with OneDrive organization.

---

## Current State

### Video System (just implemented today)
- `product_videos` table stores video metadata
- Videos linked to `sourced_products` via `product_id`
- OneDrive integration working (upload, delete, folder selection)
- Files stored in user-selected OneDrive folder

### Correlation System
- `influencer_tasks` table stores ASIN correlations
- Has `status` field (approved/declined/pending)
- Links to `sourced_products` via product context
- ASIN field on tasks represents correlated Amazon listings

### Dubbing System
- `dub-video.js` - Eleven Labs integration exists
- `dub-status.js` - Status checking
- Currently independent of video-task workflow

---

## Agent Impact Reports

### Backend
**Schema Changes Needed:**
- New `video_variants` table for dubbed versions
- Add `video_id` column to `influencer_tasks` OR new junction table
- Add marketplace/language reference data

**API Changes:**
- `videos.js` - Add endpoint to link video to tasks
- New `video-variants.js` - CRUD for dubbed versions
- Modify `dub-video.js` - Save to OneDrive subfolder with naming convention

**Integration Points:**
- Connect `product_videos` → `influencer_tasks` (via product_id or new FK)
- Auto-populate video link when correlation is approved
- Query tasks with video status

**Risks:**
- Need to handle existing tasks without videos (backward compatible)
- Dubbing failures should not block task workflow
- OneDrive folder creation may fail (handle gracefully)

**Rollback:** Drop new tables/columns, revert API changes

---

### Frontend
**New Components:**
- Video indicator on task cards (icon showing video available)
- "Dub" button for non-English tasks
- Dubbed version preview/player
- Language variant selector

**Modified Components:**
- `ProductCRM.jsx` - Show video-task linkage in detail panel
- `VideoGallery.jsx` - Show variants for a video
- Task list/cards - Add video status indicator

**User Flow:**
1. Upload video to CRM product (existing)
2. Run correlation → approved ASINs get video linked
3. View tasks → see which have videos
4. Click task → see video, click "Dub" if needed
5. Dubbed video appears in task when ready

**Risks:**
- UI complexity if too many variants shown
- Loading states for dub-in-progress
- Mobile responsiveness for new elements

**Rollback:** Revert component changes

---

### DevOps
**No infrastructure changes** - Uses existing:
- Supabase (database)
- Netlify functions
- OneDrive API
- Eleven Labs API

**Deployment:**
- Database migration required
- Function updates deploy automatically

---

### QA
**Test Coverage Needed:**
- Video-task auto-linking on correlation approval
- Dub trigger and completion
- OneDrive subfolder creation
- File naming convention
- Variant retrieval and display
- Edge cases: task without video, failed dub, disconnected OneDrive

---

## User Experience Assessment

**Current Flow:**
1. Upload video to product
2. Run correlation
3. (No connection between video and correlation results)

**Proposed Flow:**
1. Upload video to product ✅
2. Run correlation → tasks created
3. Approve tasks → video auto-linked to approved tasks
4. View task → see video available
5. For German task → click "Dub" → German version created
6. Access dubbed video from task for manual Amazon upload

**UX Risks:**
- User might not understand auto-linking (need clear UI indicator)
- Dub takes time - need good progress feedback

---

## Scale Assessment

**Current Limits:**
- Eleven Labs: API rate limits, cost per dub
- OneDrive: 15GB free storage typical

**Projected Needs:**
- 1 video per product, ~5 correlated tasks per product
- ~3 languages on average (English + 2 dubs)
- ~30MB per video × 3 = 90MB per product total

**Bottlenecks:**
- Eleven Labs dubbing time (~1-2 min per video)
- OneDrive upload bandwidth

**Mitigation:**
- Dub on-demand only (not auto-dub all)
- Progress indicators for long operations

---

## Overall Risk Level: LOW-MEDIUM

- Schema changes are additive (not destructive)
- UI changes are contained to specific components
- Dubbing is manual trigger (no runaway costs)
- Existing systems remain functional

---

## Rollback Strategy
1. Remove new UI components (feature flag if needed)
2. Drop new database tables/columns
3. Revert API function changes
4. Video system continues working as-is (without task linkage)

---

## Ready for /plan: YES

---
*Created: 2026-01-21*
