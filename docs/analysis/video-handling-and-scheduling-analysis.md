# Video Handling, Storage & Scheduling Analysis

**Date:** 2026-01-23  
**Purpose:** Analyze video intake, storage costs, and scheduling UI for social posting feature

---

## Part 1: Universal Video Format

### The Problem
Users upload videos in various formats (MOV from iPhone, MP4 from Android, etc.) but each platform has different requirements.

### The Solution: Immediate Conversion on Upload

**Universal Output Format** (works on ALL 9 platforms):
```yaml
Container: MP4
Video Codec: H.264 (High Profile, Level 4.1)
Audio Codec: AAC-LC
Audio Bitrate: 128 kbps
Sample Rate: 44.1 kHz
Channels: Stereo
Pixel Format: yuv420p
Color Space: bt709
Faststart: enabled (moov atom first)
CRF: 23 (good quality/size balance)
```

### FFmpeg Command
```bash
ffmpeg -i input.mov \
  -c:v libx264 -preset medium -crf 23 \
  -profile:v high -level 4.1 \
  -pix_fmt yuv420p \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -movflags +faststart \
  -y output.mp4
```

### Platform Compatibility Matrix

| Platform | H.264/AAC MP4 | Notes |
|----------|---------------|-------|
| Instagram | ✅ | Perfect |
| TikTok | ✅ | Perfect |
| YouTube | ✅ | Perfect |
| Facebook | ✅ | Perfect |
| Twitter | ✅ | Perfect |
| LinkedIn | ✅ | Perfect |
| Pinterest | ✅ | Perfect |
| Threads | ✅ | Perfect |
| Bluesky | ✅ | Perfect |

**Result:** One format works everywhere.

---

## Part 2: Video Intake Flow

### Recommended Architecture

```
USER UPLOADS VIDEO
        │
        ▼
┌───────────────────┐
│  Upload Handler   │
│  (Presigned URL)  │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Supabase Storage │  ← Original file (temp)
│  /uploads/raw/    │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  Background Job   │
│  (Triggered)      │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│  FFmpeg Transcode │  ← Railway service
│  to Universal MP4 │
└─────────┬─────────┘
          │
          ├──────────────────┐
          ▼                  ▼
┌───────────────────┐  ┌───────────────────┐
│  Supabase Storage │  │  Delete Original  │
│  /videos/ready/   │  │  (save storage)   │
└───────────────────┘  └───────────────────┘
```

### Key Decisions

1. **Transcode immediately** - Don't wait until posting
2. **Delete originals** - Keep only transcoded version
3. **Generate thumbnail** - Extract frame for preview
4. **Store metadata** - Duration, resolution, size

---

## Part 3: Storage Cost Analysis

### Supabase Storage Pricing

| Tier | Included | Overage |
|------|----------|---------|
| Free | 1 GB | N/A |
| Pro ($25/mo) | 100 GB | $0.021/GB |
| Team ($599/mo) | 100 GB | $0.021/GB |

### Video Size Estimates

| Video Length | Raw Size (MOV) | Transcoded (MP4) | Savings |
|--------------|----------------|------------------|---------|
| 30 seconds | ~50 MB | ~15 MB | 70% |
| 60 seconds | ~100 MB | ~30 MB | 70% |
| 90 seconds | ~150 MB | ~45 MB | 70% |
| 5 minutes | ~500 MB | ~150 MB | 70% |

**H.264 transcoding typically reduces file size by 60-70%**

### Usage Scenarios

#### Scenario A: Light Usage (5 videos/week)
```
Monthly videos: 20
Avg size after transcode: 30 MB
Monthly storage added: 600 MB
Annual storage: 7.2 GB

Cost: Within Pro tier (100 GB included)
```

#### Scenario B: Medium Usage (20 videos/week)
```
Monthly videos: 80
Avg size after transcode: 30 MB
Monthly storage added: 2.4 GB
Annual storage: 28.8 GB

Cost: Within Pro tier
```

#### Scenario C: Heavy Usage (100 videos/week)
```
Monthly videos: 400
Avg size after transcode: 30 MB
Monthly storage added: 12 GB
Annual storage: 144 GB

Cost: 44 GB overage × $0.021 = $0.92/month extra
```

### Cost Optimization Strategies

1. **Delete after posting** - Remove videos after all platforms are posted
2. **Retention policy** - Auto-delete after 30/60/90 days
3. **On-demand only** - Don't store, transcode at post time (slower UX)
4. **Tiered storage** - Move old videos to cheaper storage

### Recommended Approach

```yaml
Storage Strategy:
  - Keep transcoded videos for 30 days after upload
  - Auto-delete posted videos after 7 days (configurable)
  - Keep originals for 24 hours only (for re-processing)
  - User can "star" videos to keep permanently

Estimated Monthly Cost:
  - Light user: $0 extra (within Pro tier)
  - Medium user: $0 extra (within Pro tier)
  - Heavy user: $1-5 extra
```

---

## Part 4: Post-Bridge Scheduling UI Analysis

### Navigation Structure
```
Posts
├── Calendar      ← Visual calendar view
├── All           ← All posts (list)
├── Scheduled     ← Upcoming scheduled posts
├── Posted        ← Completed posts
└── Drafts        ← Saved drafts
```

### Calendar View Features

**Month View:**
- 7-column grid (Sun-Sat)
- Month/year header with navigation arrows
- "No posts" placeholder for empty days
- Post thumbnails/previews on days with content
- Click day to add new post

**Week View:**
- 7 columns for current week
- Date range in header (Jan 18 - Jan 24, 2026)
- Today highlighted (green background)
- More vertical space for posts per day
- Same navigation arrows

### List View Features

**Scheduled Posts:**
- Chronological list of upcoming posts
- Empty state: "No scheduled posts" + CTA button
- Filter by platform (likely)
- Post preview with platform icons

**Posted (History):**
- Chronological list of completed posts
- Success/failure status per platform
- Links to view on each platform
- Filter by date range

**Drafts:**
- Saved but not scheduled
- Quick edit/schedule actions
- Delete draft option

### Scheduling Workflow

1. **Create Post** → Select platforms, add media, write caption
2. **Toggle "Schedule post"** → Shows date/time picker
3. **Select date/time** → With timezone support
4. **Save** → Goes to Scheduled list and Calendar

---

## Part 5: Recommended Implementation for Our App

### Database Schema Additions

```sql
-- Add to product_videos table
ALTER TABLE product_videos ADD COLUMN
  scheduled_at TIMESTAMPTZ,
  scheduled_platforms JSONB DEFAULT '[]',
  post_status TEXT DEFAULT 'draft',
  post_results JSONB;

-- Or create separate posts table
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users,
  video_id UUID REFERENCES product_videos,
  caption TEXT,
  scheduled_at TIMESTAMPTZ,
  platforms JSONB NOT NULL, -- [{platform: 'instagram', account_id: '...'}]
  platform_captions JSONB, -- Platform-specific overrides
  status TEXT DEFAULT 'draft', -- draft, scheduled, processing, posted, failed
  results JSONB, -- Per-platform results
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_posts_scheduled ON social_posts(scheduled_at) 
  WHERE status = 'scheduled';
```

### UI Components Needed

1. **Calendar Component**
   - Month view with day cells
   - Week view toggle
   - Navigation (prev/next month)
   - Click to view/add posts

2. **Post List Component**
   - Filterable by status (all/scheduled/posted/drafts)
   - Sortable by date
   - Platform icons per post
   - Quick actions (edit, delete, post now)

3. **Schedule Modal**
   - Date picker
   - Time picker
   - Timezone selector
   - Platform selection
   - Caption editor with platform tabs

### Scheduling Backend

```javascript
// Cron job to process scheduled posts
// Run every minute

async function processScheduledPosts() {
  const now = new Date();
  
  const duePosts = await supabase
    .from('social_posts')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_at', now.toISOString());
  
  for (const post of duePosts) {
    // Mark as processing
    await supabase
      .from('social_posts')
      .update({ status: 'processing' })
      .eq('id', post.id);
    
    // Trigger background function for each platform
    for (const platform of post.platforms) {
      await triggerPlatformPost(post, platform);
    }
  }
}
```

---

## Part 6: Implementation Phases

### Phase 1: Video Handling (4 hours)
- [ ] Update transcode function with universal settings
- [ ] Add immediate transcode on upload
- [ ] Implement original file cleanup
- [ ] Add thumbnail generation

### Phase 2: Storage Optimization (2 hours)
- [ ] Add retention_until column to videos
- [ ] Create cleanup cron job
- [ ] Add user setting for retention period
- [ ] Implement "star" to keep permanently

### Phase 3: Scheduling Database (2 hours)
- [ ] Create social_posts table
- [ ] Add scheduling columns
- [ ] Create indexes for efficient queries

### Phase 4: Calendar UI (8 hours)
- [ ] Month view component
- [ ] Week view component
- [ ] Navigation controls
- [ ] Post previews on calendar

### Phase 5: List Views (4 hours)
- [ ] All posts list
- [ ] Scheduled posts list
- [ ] Posted (history) list
- [ ] Drafts list

### Phase 6: Schedule Modal (4 hours)
- [ ] Date/time picker
- [ ] Timezone selector
- [ ] Platform selection
- [ ] Caption editor

### Phase 7: Cron Processing (4 hours)
- [ ] Scheduled post processor
- [ ] Status tracking
- [ ] Error handling
- [ ] Retry logic

**Total Estimate: ~28 hours**

---

## Summary

| Topic | Recommendation |
|-------|----------------|
| **Video Format** | H.264/AAC MP4 - works everywhere |
| **Transcode Timing** | Immediately on upload |
| **Storage Cost** | Minimal (<$5/mo even for heavy use) |
| **Retention Policy** | 30 days default, delete after posting option |
| **Calendar UI** | Month + Week views like Post-Bridge |
| **List Views** | All, Scheduled, Posted, Drafts |
| **Implementation** | ~28 hours total |

---

*Analysis completed: 2026-01-23*
