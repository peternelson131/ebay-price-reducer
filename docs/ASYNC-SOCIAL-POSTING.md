# Async Social Media Posting Implementation

## Overview

Implemented async job queue system for social media posting to handle large videos without timeout issues.

## Changes Made

### 1. Database Migration: `supabase/migrations/20260123_social_post_jobs.sql`

Created `social_post_jobs` table with:
- **Columns:**
  - `id` (UUID, primary key)
  - `user_id` (UUID, references auth.users)
  - `video_id` (UUID, references product_videos)
  - `platforms` (JSONB array: ["youtube", "facebook", "instagram"])
  - `title`, `description` (TEXT)
  - `status` (TEXT: pending, processing, completed, failed)
  - `results` (JSONB: per-platform results with success/url/error)
  - `error` (TEXT: overall error message)
  - `created_at`, `updated_at` (TIMESTAMPTZ)

- **Indexes:** user_id, status, video_id, created_at
- **RLS Policies:** Users can only view/create/update their own jobs

**Migration Status:** ✅ Already applied to database

### 2. Modified: `netlify/functions/social-post.js`

**New Flow:**
1. Create job record in `social_post_jobs` table
2. Return immediately with HTTP 202 (Accepted) and jobId
3. Process posting in background via `processJobInBackground()`
4. Update job status and results as platforms complete

**Response Format:**
```json
{
  "jobId": "uuid",
  "status": "pending",
  "message": "Post job created and processing in background"
}
```

**Background Processing:**
- Updates status to "processing"
- Posts to each requested platform (YouTube, Facebook, Instagram)
- Stores per-platform results in JSONB
- Updates status to "completed" or "failed"
- Records in `scheduled_posts` table for history

### 3. New: `netlify/functions/social-post-status.js`

**Endpoint:** `GET /social-post-status?jobId=xxx`

Returns job status and results:
```json
{
  "jobId": "uuid",
  "status": "completed",
  "videoId": "uuid",
  "platforms": ["youtube", "facebook"],
  "title": "Video Title",
  "description": "Video Description",
  "results": {
    "youtube": {
      "success": true,
      "url": "https://youtube.com/shorts/xxx",
      "postId": "xxx"
    },
    "facebook": {
      "success": false,
      "error": "Failed to upload"
    }
  },
  "error": null,
  "createdAt": "2026-01-23T...",
  "updatedAt": "2026-01-23T..."
}
```

### 4. Utility: `apply-social-jobs-migration.js`

Node.js script to verify/apply the migration. Checks if table exists before attempting to create.

## Frontend Integration

The frontend agent will need to:

1. **Initiate Post:**
```javascript
const response = await fetch('/social-post', {
  method: 'POST',
  body: JSON.stringify({
    videoId: 'uuid',
    platforms: ['youtube', 'facebook', 'instagram'],
    title: 'Optional title',
    description: 'Optional description'
  })
});

const { jobId, status } = await response.json();
// status === 'pending'
```

2. **Poll for Status:**
```javascript
const pollStatus = async (jobId) => {
  const response = await fetch(`/social-post-status?jobId=${jobId}`);
  const job = await response.json();
  
  if (job.status === 'completed') {
    // Show success UI with job.results
  } else if (job.status === 'failed') {
    // Show error UI with job.error
  } else if (job.status === 'processing') {
    // Show progress UI, poll again
    setTimeout(() => pollStatus(jobId), 5000);
  }
};
```

3. **UI States:**
- **Pending:** "Your video is queued for posting..."
- **Processing:** "Posting to platforms... (YouTube ✓, Facebook ⏳)"
- **Completed:** "Posted successfully! View on: [YouTube] [Facebook]"
- **Failed:** "Failed to post: {error message}"

## Benefits

1. **No Timeouts:** Large videos (especially Instagram transcoding) won't timeout
2. **Immediate Response:** User gets feedback instantly
3. **Progress Tracking:** Users can see which platforms succeeded/failed
4. **Retry Support:** Failed jobs can be retried (future enhancement)
5. **Job History:** All jobs stored for audit/debugging

## Testing

Test the endpoints:

```bash
# 1. Post a video
curl -X POST https://your-site.netlify.app/.netlify/functions/social-post \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"videoId":"uuid","platforms":["youtube"]}'

# Response: { "jobId": "uuid", "status": "pending" }

# 2. Check status
curl https://your-site.netlify.app/.netlify/functions/social-post-status?jobId=uuid \
  -H "Authorization: Bearer YOUR_TOKEN"

# Response: { "jobId": "uuid", "status": "processing", ... }
```

## Notes

- Background processing uses `processJobInBackground().catch()` to prevent unhandled rejections
- Each platform result is independent - one failure doesn't stop others
- All existing scheduled_posts records are still created for history
- RLS ensures users can only see their own jobs

## Next Steps for Frontend

1. Update social posting UI to use job-based flow
2. Implement polling with exponential backoff
3. Add real-time status indicators
4. Show per-platform success/failure status
5. Add retry button for failed jobs (requires backend enhancement)

## Deployment

Changes committed and pushed to main branch. Migration already applied to production database.

```bash
git log -1 --oneline
# 400dc28 feat: implement async social media posting with job queue
```
