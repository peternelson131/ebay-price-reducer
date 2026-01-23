# Review Document: Pre-Upload Architecture for Video Posting

**Date:** 2026-01-23  
**Feature:** Pre-Upload Architecture (Option A from analysis)  
**Reference:** `docs/analysis/video-posting-performance-analysis.md`

---

## Request Summary

Implement **Option A: Pre-Upload Architecture** to make video posting to social media (especially Instagram) feel instant. Instead of transcoding videos when the user clicks "Post", transcode them in the background when videos sync from OneDrive. By the time the user wants to post, the video is already hosted and ready.

---

## Core Objective

**Make video posting feel as fast as Buffer** - user clicks "Post Now", modal closes in <5 seconds, video appears on Instagram.

---

## Scope

### In Scope
- Database schema: Add social-ready URL/status columns to `product_videos`
- Background transcoding: Trigger when video syncs from OneDrive
- Upload transcoded video to Supabase Storage (public URL)
- Update `PostToSocialModal` to use pre-hosted URLs
- Video cards show "Processing..." → "Ready to Post" status
- Optimistic UI: Close modal immediately after job creation

### Out of Scope
- Video dubbing/variants (already has `video_variants` table)
- Multi-format transcoding (just Instagram-ready MP4 for now)
- Automatic re-transcoding of existing videos (migration optional)
- Video retention policies (future optimization)

### Assumptions
1. Supabase Storage has sufficient quota for transcoded videos
2. Railway transcoder service will be used (already configured)
3. All new videos get transcoded; existing videos can be transcoded on-demand
4. Instagram-ready format: MP4, H.264, AAC (same as current transcoder output)

---

## Relevant Context

### Past Work
- **2026-01-21:** OneDrive Video Integration built (`product_videos` table exists)
- **2026-01-21:** `video_variants` table created for dubbed versions
- **2026-01-22:** Manual Social Media Posting UI completed (`PostToSocialModal`)

### Existing Tables
```sql
-- product_videos: Main video records
-- video_variants: Dubbed versions in different languages
-- social_connections: YouTube/Meta OAuth tokens
-- social_post_jobs: Track posting jobs
-- scheduled_posts: Track individual platform posts
```

### Current Flow (slow)
```
Post Now → Download OneDrive → Transcode → Upload Supabase → Instagram Container → Poll → Publish
                    ↑                                               ↑
              1-5 MINUTES                                      1-5 MINUTES
```

### Target Flow (fast)
```
Video Syncs → [Background: Download → Transcode → Upload] → Ready!
                         (user doesn't wait)

Post Now → Use pre-hosted URL → Instagram Container → Done
                                    <5 seconds
```

---

## Lessons Applicable

From `lessons/architecture.md`:
> "Before proposing a complex solution, check if the problem is already solved."

**Applied:** The `video_variants` table pattern (with status tracking) can be adapted for social-ready versions.

From `lessons/test-before-deploy.md`:
> "Always test the full flow in a deployed environment before declaring complete."

**Applied:** QA must verify the full video sync → transcode → post flow in production.

---

## Open Questions

**None for Pete** - All implementation details can be figured out by the agents.

---

## Ready for /assess: ✅ YES
