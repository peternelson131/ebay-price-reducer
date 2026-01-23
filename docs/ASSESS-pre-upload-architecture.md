# Impact Assessment: Pre-Upload Architecture

**Date:** 2026-01-23  
**Feature:** Pre-Upload Architecture for Video Posting  
**Reference:** `docs/REVIEW-pre-upload-architecture.md`

---

## Objective (from Review)

Make video posting feel as fast as Buffer - user clicks "Post Now", modal closes in <5 seconds, video appears on Instagram.

---

## Current State

### Database
```sql
-- product_videos: Main video records (has onedrive_file_id, NO social-ready URL)
-- video_variants: Dubbed versions pattern (we can follow this)
-- social_post_jobs: Tracks posting jobs
-- scheduled_posts: Individual platform post records
```

### Backend Flow (Current)
```
POST /social-post
  → Creates job, returns 202
  → Invokes social-post-processor-background
     → Download from OneDrive (10-30s)
     → Call Railway transcoder (1-5 min) ⚠️ BOTTLENECK
     → Upload to Supabase Storage (10-30s)
     → Create Instagram container
     → Poll Instagram status (1-5 min) ⚠️ BOTTLENECK
     → Publish
```

### Frontend Flow (Current)
```
PostToSocialModal:
  - Polls /social-post-status every 3 seconds
  - Shows progress stages (downloading, transcoding, uploading, processing)
  - User waits 2-7+ minutes with modal open
  - Modal closes on completion

VideoGallery:
  - Shows video thumbnails from OneDrive
  - "Post" button opens PostToSocialModal
  - No social-ready status shown
```

---

## Agent Impact Reports

### Backend Agent

**Changes Required:**
1. **Database Migration:**
   - Add columns to `product_videos`:
     - `social_ready_url` (TEXT) - Public Supabase Storage URL
     - `social_ready_status` (TEXT) - pending/processing/ready/failed
     - `social_ready_at` (TIMESTAMPTZ) - When transcoding completed

2. **New Function: `video-transcode-trigger.js`**
   - Triggered when video syncs from OneDrive
   - Downloads video, transcodes via Railway, uploads to Supabase Storage
   - Updates `social_ready_url` and status

3. **Update: `social-post-processor-background.js`**
   - Check for `social_ready_url` first
   - If ready: Skip transcoding, use existing URL
   - If not ready: Fall back to current flow (on-demand transcode)

4. **Supabase Storage:**
   - Create bucket: `transcoded-videos`
   - Public access for Instagram to fetch
   - File naming: `{user_id}/{video_id}.mp4`

**Risks:**
- Supabase Storage costs scale with video count
- Railway transcoder could be unavailable
- OneDrive tokens could expire during background job

**Rollback:**
- Keep current on-demand transcoding as fallback
- `social_ready_url` is nullable - old flow still works

---

### Frontend Agent

**Changes Required:**
1. **Update `VideoGallery.jsx`:**
   - Show `social_ready_status` badge on video cards:
     - "Processing..." (yellow) - transcoding in progress
     - "Ready to Post" (green) - social_ready_url exists
     - No badge - not yet transcoded
   - Disable "Post" button if status is "processing"

2. **Update `PostToSocialModal.jsx`:**
   - Implement optimistic UI:
     - After successful job creation → close modal immediately
     - Show toast: "Post queued! Processing in background."
   - Remove long-running progress polling from modal
   - If video has `social_ready_url` → posting is nearly instant

3. **New: Background status indicator** (optional enhancement)
   - Small icon/badge in navbar showing active background jobs
   - Or: Refresh video gallery status periodically

**Risks:**
- User might not see failures (optimistic UI hides them)
- Need clear indication that post is "queued" vs "complete"

**Rollback:**
- Revert to current polling behavior
- Feature flag possible

---

### QA Agent

**Test Scenarios Required:**
1. **Happy Path:** Video syncs → transcodes in background → user posts → instant success
2. **Transcode Failure:** Background job fails → status shows "failed" → user can retry
3. **Post Before Ready:** Video still transcoding → user tries to post → graceful handling
4. **Mixed State:** Some videos ready, some not → correct badges displayed
5. **Large Video:** 500MB+ video → transcode completes within reasonable time
6. **Edge Cases:**
   - Video deleted during transcode
   - User disconnects OneDrive during transcode
   - Instagram rejects the transcoded video

**Regression Risks:**
- Existing social posting flow must still work
- OneDrive sync must not break
- Video playback must not be affected

---

### DevOps Agent

**Changes Required:**
1. **Supabase Storage:**
   - Create `transcoded-videos` bucket
   - Configure public access policy
   - Set up CORS for Instagram fetch

2. **Environment Variables:**
   - Verify `TRANSCODER_URL` set (already exists)
   - Verify Supabase Storage credentials

3. **Deployment:**
   - Deploy new background function
   - No breaking changes - backward compatible

**Risks:**
- Storage quota limits
- Background function timeout (15 min should be sufficient)

---

## User Experience Assessment

### Current Flow (Poor UX)
```
1. User clicks "Post Now"
2. Modal stays open with spinner
3. Progress updates: "Downloading..." "Transcoding..." "Uploading..."
4. User waits 2-7 minutes
5. Finally: "Success!"
6. Modal closes
```

### Proposed Flow (Great UX)
```
1. Video syncs from OneDrive
2. Badge shows "Processing..." (user doesn't wait)
3. Minutes later: Badge changes to "Ready to Post"
4. User clicks "Post Now"
5. Modal shows instant success (video already hosted)
6. Modal closes in <5 seconds
7. Background: Instagram processes, posts appear
```

### UX Risks
- User might click "Post" before ready → need clear messaging
- User might not understand "Processing..." badge → need tooltip
- Failure notifications could be missed → need clear error state

---

## Scale Assessment

### Current Limits
- OneDrive API: 10,000 req/day
- Railway transcoder: No documented limits (pay per use)
- Supabase Storage: Depends on plan

### Projected Needs (100 videos/day)
- 100 transcoding jobs/day
- ~5GB storage/day (assuming 50MB avg transcoded size)
- ~150GB/month storage

### Bottlenecks
- Railway transcoder queue during high volume
- Supabase Storage costs at scale

### Mitigation
- Queue transcoding jobs, process in order
- Consider retention policy (delete transcoded after X days)
- Monitor storage usage

---

## Overall Risk Level: **MEDIUM**

**Rationale:**
- Backend changes are significant but isolated
- Frontend changes are straightforward
- Fallback to current flow provides safety net
- No breaking changes to existing functionality

---

## Rollback Strategy

### Immediate Rollback (if deploy fails)
1. Revert frontend changes (modal keeps polling)
2. Backend still works - `social_ready_url` is nullable

### Data Rollback (if issues found)
1. Clear `social_ready_url` columns
2. Existing on-demand transcoding takes over

### Full Rollback (worst case)
1. Revert all code changes
2. Drop new database columns (migration down)
3. Return to previous release

---

## Implementation Summary

| Agent | Tasks | Effort |
|-------|-------|--------|
| Backend | Migration, new function, update processor | 4-6 hours |
| Frontend | VideoGallery badges, Modal optimistic UI | 2-3 hours |
| QA | Full flow testing, edge cases | 2-3 hours |
| DevOps | Storage bucket setup | 30 min |

**Total Estimated Effort:** 8-12 hours

---

## Ready for /plan: ✅ YES
