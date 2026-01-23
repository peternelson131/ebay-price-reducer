# Implementation Plan: Pre-Upload Architecture

**Date:** 2026-01-23  
**Feature:** Pre-Upload Architecture for Video Posting  
**Reference:** `docs/ASSESS-pre-upload-architecture.md`

---

## Objective

Make video posting feel as fast as Buffer - user clicks "Post Now", modal closes in <5 seconds, video appears on Instagram.

---

## Task List

### Task 1: Database Migration
**Owner:** `backend`  
**Dependencies:** None  
**Complexity:** Low  
**Estimated effort:** 30 min

**Description:**
Add columns to `product_videos` table to track social-ready status and URL.

**Schema Changes:**
```sql
ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS social_ready_url TEXT;
ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS social_ready_status TEXT DEFAULT 'pending' 
  CHECK (social_ready_status IN ('pending', 'processing', 'ready', 'failed'));
ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS social_ready_at TIMESTAMPTZ;
ALTER TABLE product_videos ADD COLUMN IF NOT EXISTS social_ready_error TEXT;
```

**Acceptance Criteria:**
- [ ] Migration file created: `supabase/migrations/YYYYMMDD_add_social_ready_columns.sql`
- [ ] Columns added to product_videos table
- [ ] Default status is 'pending' for new videos
- [ ] Migration is backward compatible (nullable columns)

**Test Requirements:**
- [ ] Migration applies cleanly on fresh database
- [ ] Migration applies cleanly on existing database with data
- [ ] Existing videos retain all current data

**Rollback Plan:**
Drop columns via down migration.

---

### Task 2: Supabase Storage Bucket Setup
**Owner:** `backend` (can be done during migration task)  
**Dependencies:** None  
**Complexity:** Low  
**Estimated effort:** 15 min

**Description:**
Create Supabase Storage bucket for transcoded videos with public access.

**Details:**
- Bucket name: `transcoded-videos`
- Public access: Yes (Instagram needs to fetch video URL)
- File structure: `{user_id}/{video_id}.mp4`

**Acceptance Criteria:**
- [ ] Bucket `transcoded-videos` created in Supabase
- [ ] Public access policy configured
- [ ] CORS configured for cross-origin access
- [ ] Test file can be uploaded and accessed via public URL

**Test Requirements:**
- [ ] Upload test file via Supabase client
- [ ] Verify public URL is accessible without auth
- [ ] Verify URL works in incognito browser (no cookies)

**Rollback Plan:**
Delete bucket (transcoded files would be lost - acceptable for rollback scenario).

---

### Task 3: Video Transcode Background Function
**Owner:** `backend`  
**Dependencies:** Task 1, Task 2  
**Complexity:** High  
**Estimated effort:** 2-3 hours

**Description:**
Create new background function that transcodes videos after OneDrive sync and stores them in Supabase.

**New File:** `netlify/functions/video-transcode-background.js`

**Flow:**
```
1. Receive video ID
2. Update status to 'processing'
3. Get OneDrive access token
4. Download video from OneDrive
5. Call Railway transcoder (video_url → transcoded MP4)
6. Upload transcoded video to Supabase Storage
7. Update product_videos with social_ready_url
8. Update status to 'ready'
9. On any error: Update status to 'failed' with error message
```

**Trigger Points:**
- Option A: Call from `videos.js` when video record is created
- Option B: New endpoint `/trigger-transcode?videoId=X`
- Option C: Scheduled job scans for pending videos

**Recommendation:** Option A (cleanest integration)

**Acceptance Criteria:**
- [ ] Function created and deployed
- [ ] Successfully transcodes test video (MOV → MP4)
- [ ] Uploads transcoded file to Supabase Storage
- [ ] Updates `social_ready_url` with public URL
- [ ] Updates `social_ready_status` to 'ready' on success
- [ ] Updates `social_ready_status` to 'failed' on error with message
- [ ] Handles large files (100MB+) without timeout
- [ ] Idempotent: Calling twice doesn't create duplicate files

**Test Requirements:**
- [ ] Unit test: Status transitions
- [ ] Integration test: Full transcode flow with test video
- [ ] Error test: Transcoder unavailable → status = 'failed'
- [ ] Error test: OneDrive token expired → status = 'failed'
- [ ] Timeout test: Large video completes within 15 min limit

**Rollback Plan:**
Function can be disabled; videos fall back to on-demand transcoding.

---

### Task 4: Update Social Post Processor
**Owner:** `backend`  
**Dependencies:** Task 3  
**Complexity:** Medium  
**Estimated effort:** 1-2 hours

**Description:**
Modify `social-post-processor-background.js` to use pre-transcoded URLs when available.

**Changes to `postToInstagram()` function:**
```javascript
// NEW: Check for pre-transcoded URL first
if (video.social_ready_url && video.social_ready_status === 'ready') {
  console.log('Using pre-transcoded URL:', video.social_ready_url);
  transcodedUrl = video.social_ready_url;
  // Skip download, skip transcoding, skip Supabase upload
  // Go directly to Instagram container creation
} else {
  // FALLBACK: Existing on-demand transcode flow
  console.log('Pre-transcoded URL not available, using on-demand transcoding');
  // ... existing code ...
}
```

**Acceptance Criteria:**
- [ ] Uses `social_ready_url` when status is 'ready'
- [ ] Falls back to on-demand transcoding when not ready
- [ ] Instagram post succeeds with pre-transcoded URL
- [ ] Logs indicate which path was taken
- [ ] Progress stages still update correctly

**Test Requirements:**
- [ ] Test with pre-transcoded video → fast path
- [ ] Test without pre-transcoded video → fallback path
- [ ] Test with failed transcode → fallback path
- [ ] Regression: Existing YouTube/Facebook posting unchanged

**Rollback Plan:**
Revert changes; always uses on-demand transcoding.

---

### Task 5: Video API - Include Social Ready Status
**Owner:** `backend`  
**Dependencies:** Task 1  
**Complexity:** Low  
**Estimated effort:** 30 min

**Description:**
Update `videos.js` endpoint to include social ready status in responses.

**Changes:**
- Select statement includes new columns
- Response includes `social_ready_url`, `social_ready_status`, `social_ready_at`

**Acceptance Criteria:**
- [ ] GET /videos response includes social_ready_status
- [ ] GET /videos response includes social_ready_url (when available)
- [ ] Frontend can read status without additional API call

**Test Requirements:**
- [ ] API returns new fields
- [ ] Fields are null for videos without transcoding

**Rollback Plan:**
Remove new fields from response (non-breaking).

---

### Task 6: VideoGallery Status Badges
**Owner:** `frontend`  
**Dependencies:** Task 5  
**Complexity:** Medium  
**Estimated effort:** 1-2 hours

**Description:**
Add visual badges to video cards showing social-ready status.

**Badge States:**
| Status | Badge | Color | Tooltip |
|--------|-------|-------|---------|
| `pending` | None or "Queued" | Gray | "Waiting to process" |
| `processing` | "Processing..." | Yellow/Amber | "Preparing for social media" |
| `ready` | "Ready to Post" | Green | "Ready to post instantly" |
| `failed` | "Transcode Failed" | Red | Shows error message |

**UI Changes:**
- Badge appears on video card (top-right corner or below thumbnail)
- Clicking badge on 'failed' shows retry option
- "Post" button disabled during 'processing' state

**Acceptance Criteria:**
- [ ] Badge shows correct state for each video
- [ ] Badge colors match status (green=ready, yellow=processing, red=failed)
- [ ] Tooltip provides helpful context
- [ ] Post button disabled during processing
- [ ] UI refreshes when status changes (polling or realtime)

**Test Requirements:**
- [ ] Visual test: All badge states render correctly
- [ ] Interaction test: Post button disabled during processing
- [ ] Interaction test: Retry button works on failed
- [ ] Responsive: Badges look good on mobile

**Rollback Plan:**
Hide badges; all videos show "Post" button as before.

---

### Task 7: PostToSocialModal Optimistic UI
**Owner:** `frontend`  
**Dependencies:** Task 4  
**Complexity:** Medium  
**Estimated effort:** 1-2 hours

**Description:**
Change modal to close immediately after job creation instead of waiting for completion.

**New Behavior:**
1. User clicks "Post Now"
2. API creates job → returns 202 with jobId
3. Modal shows "Post queued!" success toast
4. Modal closes immediately (no more polling in modal)
5. Background: Job processes, Instagram post appears

**Status Tracking:**
- Option A: No tracking after modal closes (simplest)
- Option B: VideoGallery polls for recent job status
- Option C: Toast notification when job completes

**Recommendation:** Option A for MVP, Option C as enhancement

**Acceptance Criteria:**
- [ ] Modal closes within 5 seconds of clicking "Post Now"
- [ ] Success toast shows "Post queued! Processing in background."
- [ ] No more 3-second polling in modal
- [ ] Job still processes successfully in background
- [ ] Error during job creation still shows error in modal

**Test Requirements:**
- [ ] Timing test: Modal closes in <5 seconds
- [ ] User flow: Post → modal closes → video posts correctly
- [ ] Error test: API error → modal shows error (doesn't close)
- [ ] Regression: Platform connection checks still work

**Rollback Plan:**
Revert to polling-based modal.

---

### Task 8: Trigger Transcoding on Video Sync
**Owner:** `backend`  
**Dependencies:** Task 3  
**Complexity:** Low  
**Estimated effort:** 30 min

**Description:**
Automatically trigger transcoding when video is added to database.

**Integration Point:** `videos.js` POST handler (create video record)

**Changes:**
```javascript
// After inserting video record:
// Trigger background transcoding
fetch(`${process.env.URL}/.netlify/functions/video-transcode-background`, {
  method: 'POST',
  body: JSON.stringify({ videoId: newVideo.id })
});
// Don't await - fire and forget
```

**Acceptance Criteria:**
- [ ] New video triggers transcode automatically
- [ ] Sync completes quickly (doesn't wait for transcode)
- [ ] Transcode job processes in background
- [ ] Status transitions: pending → processing → ready

**Test Requirements:**
- [ ] Sync video → transcode starts automatically
- [ ] Sync multiple videos → all trigger transcoding
- [ ] Transcode failure doesn't affect sync success

**Rollback Plan:**
Remove trigger; videos stay in 'pending' status.

---

### Task 9: QA Full Flow Verification
**Owner:** `qa`  
**Dependencies:** Tasks 1-8  
**Complexity:** Medium  
**Estimated effort:** 2-3 hours

**Description:**
Comprehensive testing of the entire flow from video sync to Instagram post.

**Test Scenarios:**
1. **Happy Path:**
   - Sync video from OneDrive
   - Verify badge shows "Processing..."
   - Wait for badge to show "Ready to Post"
   - Click Post → Modal closes in <5 seconds
   - Verify video appears on Instagram

2. **Pre-ready Post:**
   - Try to post while status is 'processing'
   - Verify button disabled or graceful handling

3. **Transcode Failure:**
   - Simulate transcoder failure
   - Verify badge shows "Failed" with error
   - Verify retry option works

4. **Fallback Path:**
   - Post video that isn't pre-transcoded
   - Verify on-demand transcoding works (slower but succeeds)

5. **Large Video:**
   - Test with 100MB+ video
   - Verify transcode completes within limits

**Acceptance Criteria:**
- [ ] All test scenarios pass
- [ ] No regressions in existing functionality
- [ ] UI behaves correctly in all states
- [ ] Screenshot evidence of each test

**Rollback Plan:**
N/A (testing task)

---

## Execution Order

```
Phase 1 (Foundation) - Can run in parallel:
  ├── Task 1: Database Migration
  └── Task 2: Storage Bucket Setup

Phase 2 (Backend Core):
  └── Task 3: Transcode Background Function
      └── Task 4: Update Social Post Processor
          └── Task 5: Video API Updates

Phase 3 (Frontend):
  ├── Task 6: VideoGallery Badges (after Task 5)
  └── Task 7: Modal Optimistic UI (after Task 4)

Phase 4 (Integration):
  └── Task 8: Trigger on Sync (after Task 3)

Phase 5 (Verification):
  └── Task 9: QA Full Flow Testing
```

**Critical Path:** 1 → 3 → 4 → 7

---

## Verification Points

| After Task | Verify |
|------------|--------|
| Task 1 | Database columns exist, migration successful |
| Task 3 | Transcoding works end-to-end |
| Task 4 | Instagram posting uses pre-transcoded URL |
| Task 6 | Badges display correctly |
| Task 7 | Modal closes quickly |
| Task 9 | Full flow works in production |

---

## Overall Rollback Strategy

### Level 1: Feature Off (Minimal Impact)
- Remove transcode trigger (Task 8)
- All videos stay in 'pending' status
- Existing on-demand flow handles everything

### Level 2: UI Rollback
- Revert frontend changes (Tasks 6, 7)
- Backend continues processing but badges don't show

### Level 3: Full Rollback
- Revert all code changes
- Drop new database columns
- Delete storage bucket
- Return to previous release

---

## Ready for /implement: ✅ YES
