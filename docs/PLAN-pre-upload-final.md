# Pre-Upload Architecture - Final Deployment Plan

**Date:** 2026-01-23  
**Status:** Ready for Deployment

---

## Background

All code has been written and reviewed. This plan covers deployment and verification only.

---

## Tasks

### Task 1: Create Supabase Storage Bucket
**Owner:** DevOps/Manual  
**Effort:** 5 min

**Steps:**
1. Go to Supabase Dashboard → Storage
2. Click "New Bucket"
3. Name: `transcoded-videos`
4. Public: ✅ Yes
5. Add RLS policy for public read

**Acceptance Criteria:**
- [ ] Bucket visible in Storage dashboard
- [ ] Can access `https://[project].supabase.co/storage/v1/object/public/transcoded-videos/` (may 404 - that's ok)

---

### Task 2: Apply Database Migration
**Owner:** Backend  
**Effort:** 2 min

**Command:**
```bash
# Option 1: Via Supabase CLI
supabase db push

# Option 2: Direct SQL (if CLI not available)
psql $DATABASE_URL < supabase/migrations/20260123_add_social_ready_columns.sql
```

**Acceptance Criteria:**
- [ ] `product_videos` table has columns: `social_ready_url`, `social_ready_status`, `social_ready_at`, `social_ready_error`
- [ ] No SQL errors

---

### Task 3: Commit and Deploy Code
**Owner:** DevOps  
**Effort:** 5 min

**Commands:**
```bash
cd /Users/jcsdirect/clawd/projects/ebay-price-reducer

# Stage all changes
git add netlify/functions/video-transcode-background.js
git add netlify/functions/social-post-processor-background.js
git add netlify/functions/videos.js
git add frontend/src/components/PostToSocialModal.jsx
git add frontend/src/components/onedrive/VideoGallery.jsx
git add supabase/migrations/20260123_add_social_ready_columns.sql

# Commit
git commit -m "feat: Pre-Upload Architecture for instant video posting

Backend:
- Add video-transcode-background.js for pre-transcoding
- Update social-post-processor to use pre-transcoded URLs
- Update videos.js to trigger transcode on upload

Frontend:
- Add status badges to VideoGallery (Queued/Processing/Ready/Failed)
- Update PostToSocialModal with optimistic UI

Database:
- Add social_ready columns to product_videos"

# Push
git push origin main
```

**Acceptance Criteria:**
- [ ] Netlify deploy succeeds
- [ ] No build errors

---

### Task 4: Verify Environment Variables
**Owner:** DevOps  
**Effort:** 2 min

**Required in Netlify:**
- `TRANSCODER_URL` - Railway transcoder service URL
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service key

**Acceptance Criteria:**
- [ ] All env vars present in Netlify dashboard

---

### Task 5: End-to-End QA Verification
**Owner:** QA  
**Effort:** 15-20 min

**Test Cases:**

**TC1: Video Upload Triggers Transcode**
1. Upload a video to OneDrive folder
2. Sync videos in app
3. Check video card shows "Queued" then "Processing"
4. Wait 2-5 minutes
5. Check video card shows "Ready to Post" ✅

**TC2: Fast Path Posting**
1. Find video with "Ready to Post" status
2. Click "Post" button
3. Select Instagram
4. Click "Post Now"
5. Modal closes immediately ✅
6. Check Netlify logs for "Using pre-transcoded URL (fast path)"

**TC3: Fallback Path (if transcode not ready)**
1. Find video with "Queued" or "Processing" status
2. Click "Post" button
3. Post to Instagram
4. Should still work (on-demand transcoding) ✅
5. Check logs for "Using on-demand transcoding (fallback)"

**TC4: Error Handling**
1. Check failed transcode shows "Transcode Failed" badge
2. Hover shows error message in tooltip

**Acceptance Criteria:**
- [ ] TC1: Video synced → status changes to "Ready to Post"
- [ ] TC2: Fast path posting works (instant)
- [ ] TC3: Fallback still works (slower but functional)
- [ ] TC4: Errors display correctly

---

## Execution Order

1. ⬜ Task 1: Create Storage Bucket (manual, Supabase dashboard)
2. ⬜ Task 2: Apply Migration (can do via Supabase CLI or dashboard)
3. ⬜ Task 3: Commit and Deploy
4. ⬜ Task 4: Verify Env Vars
5. ⬜ Task 5: QA Verification

---

## Notes

- **Frontend already implements status badges** - VideoGallery.jsx has `getSocialReadyBadge()` function
- **Optimistic UI already implemented** - PostToSocialModal closes immediately after job creation
- **Fallback is automatic** - If pre-transcode fails or not ready, on-demand transcoding kicks in
- **No breaking changes** - Existing functionality continues to work
