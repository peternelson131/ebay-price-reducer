# Implementation Plan: Video-ASIN Correlation + Multi-Marketplace Dubbing

## Objective
Link uploaded videos to approved ASIN correlation tasks, enable manual dubbing for non-English marketplaces with organized OneDrive storage.

---

## Phase 1: Video-Task Correlation

### Task 1: Database Schema - Video-Task Linkage
**Owner:** backend
**Dependencies:** None
**Complexity:** Medium

**Description:**
Create migration to link videos to influencer tasks. Add `video_id` column to `influencer_tasks` table.

**Schema:**
```sql
-- Add video reference to tasks
ALTER TABLE influencer_tasks 
  ADD COLUMN video_id UUID REFERENCES product_videos(id);

-- Index for video lookups
CREATE INDEX idx_influencer_tasks_video_id ON influencer_tasks(video_id);
```

**Acceptance Criteria:**
- [ ] Migration created and tested locally
- [ ] Column is nullable (existing tasks don't have videos)
- [ ] Foreign key constraint to product_videos
- [ ] RLS policies allow user to see their own task videos

**Test Requirements:**
- [ ] Migration runs without errors
- [ ] Existing tasks unaffected
- [ ] Can insert task with video_id
- [ ] FK constraint prevents invalid video_id

**Rollback:** `ALTER TABLE influencer_tasks DROP COLUMN video_id;`

---

### Task 2: API - Auto-link Video to Approved Tasks
**Owner:** backend
**Dependencies:** Task 1
**Complexity:** Medium

**Description:**
When a video is uploaded to a product, automatically link it to all APPROVED tasks for that product. Modify `videos.js` POST handler.

**Logic:**
1. After video record created
2. Find all `influencer_tasks` where:
   - Task's product matches video's product
   - Task status = 'approved'
3. Update those tasks with `video_id`

**Acceptance Criteria:**
- [ ] Video upload triggers task linkage
- [ ] Only approved tasks get linked
- [ ] Declined/pending tasks not linked
- [ ] Multiple tasks can share same video

**Test Requirements:**
- [ ] Upload video → approved tasks get video_id
- [ ] Declined tasks don't get video_id
- [ ] Tasks for different products unaffected

**Rollback:** Remove auto-link logic from videos.js

---

### Task 3: API - Get Tasks with Video Status
**Owner:** backend  
**Dependencies:** Task 1
**Complexity:** Low

**Description:**
Modify task query API to include video information. Return `video_id` and basic video metadata with tasks.

**Acceptance Criteria:**
- [ ] Task list includes video_id
- [ ] Task detail includes video metadata (filename, onedrive_path)
- [ ] Null video_id handled gracefully

**Test Requirements:**
- [ ] API returns video_id in task response
- [ ] Video metadata joined correctly
- [ ] Performance acceptable with join

**Rollback:** Remove video join from task query

---

### Task 4: Frontend - Video Indicator on Task Cards
**Owner:** frontend
**Dependencies:** Task 3
**Complexity:** Medium

**Description:**
Add visual indicator on task cards showing whether a video is available. Show video icon with status.

**UI Elements:**
- 🎬 icon when video available
- Tooltip showing video filename
- Click to preview/expand

**Acceptance Criteria:**
- [ ] Tasks with video show indicator
- [ ] Tasks without video show no indicator (or "no video" state)
- [ ] Indicator is visually clear

**Test Requirements:**
- [ ] Indicator displays correctly for tasks with video
- [ ] No indicator for tasks without video
- [ ] Responsive on mobile

**Rollback:** Remove indicator component

---

### Task 5: Frontend - View Video from Task
**Owner:** frontend
**Dependencies:** Task 4
**Complexity:** Low

**Description:**
Allow user to view the linked video directly from task detail view.

**Acceptance Criteria:**
- [ ] Click video indicator → opens video preview/player
- [ ] Can access video file (play or download)
- [ ] Graceful handling if video deleted from OneDrive

**Test Requirements:**
- [ ] Video preview works
- [ ] Download link works
- [ ] Error handling for missing video

**Rollback:** Remove video viewer from task

---

## 🔴 VERIFICATION POINT 1
After Tasks 1-5: Verify video-task linkage works end-to-end
- Upload video to product
- Run correlation, approve tasks  
- Confirm tasks show video indicator
- Confirm video viewable from task

---

## Phase 2: Dubbing & Variants

### Task 6: Database Schema - Video Variants
**Owner:** backend
**Dependencies:** Task 1
**Complexity:** Medium

**Description:**
Create table to track dubbed video variants.

**Schema:**
```sql
CREATE TABLE video_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_video_id UUID REFERENCES product_videos(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  onedrive_file_id TEXT,
  onedrive_path TEXT,
  filename TEXT NOT NULL,
  file_size BIGINT,
  dub_status TEXT DEFAULT 'pending', -- pending, processing, complete, failed
  dub_job_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE(original_video_id, language)
);

-- Marketplace reference
CREATE TABLE marketplaces (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  language TEXT NOT NULL,
  requires_dubbing BOOLEAN DEFAULT false
);

-- Seed marketplace data
INSERT INTO marketplaces VALUES
  ('US', 'United States', 'en', false),
  ('CA', 'Canada', 'en', false),
  ('UK', 'United Kingdom', 'en', false),
  ('AU', 'Australia', 'en', false),
  ('DE', 'Germany', 'de', true),
  ('FR', 'France', 'fr', true),
  ('ES', 'Spain', 'es', true),
  ('IT', 'Italy', 'it', true),
  ('MX', 'Mexico', 'es', true),
  ('JP', 'Japan', 'ja', true);
```

**Acceptance Criteria:**
- [ ] video_variants table created
- [ ] marketplaces reference table seeded
- [ ] RLS policies for user access

**Test Requirements:**
- [ ] Can create variant record
- [ ] Unique constraint on (video_id, language)
- [ ] Cascade delete works

**Rollback:** Drop tables

---

### Task 7: API - Create Video Variant (Trigger Dub)
**Owner:** backend
**Dependencies:** Task 6
**Complexity:** High

**Description:**
New endpoint to trigger dubbing for a video. Creates variant record, triggers Eleven Labs, saves to OneDrive subfolder.

**Endpoint:** `POST /video-variants`
**Body:** `{ videoId, language }`

**Logic:**
1. Check if variant already exists for this language
2. Create variant record with status='pending'
3. Get original video from OneDrive
4. Trigger Eleven Labs dub
5. On completion:
   - Create OneDrive subfolder (`content-{language}/`)
   - Upload dubbed file as `{ASIN}_{Language}.ext`
   - Update variant record with status='complete'

**Acceptance Criteria:**
- [ ] Creates variant record
- [ ] Triggers dubbing via Eleven Labs
- [ ] Creates language subfolder in OneDrive
- [ ] Saves with correct filename pattern
- [ ] Updates status on completion
- [ ] Handles errors gracefully

**Test Requirements:**
- [ ] Successful dub creates variant
- [ ] Duplicate dub request returns existing
- [ ] Failed dub sets error status
- [ ] OneDrive folder created correctly

**Rollback:** Remove endpoint

---

### Task 8: Frontend - Dub Button on Tasks
**Owner:** frontend
**Dependencies:** Task 7, Task 4
**Complexity:** Medium

**Description:**
Add "Dub" button on tasks that require non-English language. Button triggers dubbing workflow.

**UI:**
- Show "Dub to German" button on DE marketplace tasks
- Show progress/status while dubbing
- Show "Dubbed ✓" when complete

**Acceptance Criteria:**
- [ ] Dub button appears on tasks requiring dubbing
- [ ] Button disabled if already dubbed or in progress
- [ ] Progress indicator during dubbing
- [ ] Success state when complete

**Test Requirements:**
- [ ] Button triggers dub API
- [ ] UI updates on completion
- [ ] Error handling for failed dub

**Rollback:** Remove dub button

---

### Task 9: Frontend - View Dubbed Variant
**Owner:** frontend
**Dependencies:** Task 8
**Complexity:** Low

**Description:**
Allow viewing/downloading dubbed variant from task.

**Acceptance Criteria:**
- [ ] Dubbed video playable from task
- [ ] Shows both original and dubbed versions
- [ ] Download link for dubbed version

**Test Requirements:**
- [ ] Dubbed video plays correctly
- [ ] Download works
- [ ] Correct language indicated

**Rollback:** Remove variant viewer

---

## 🔴 VERIFICATION POINT 2
After Tasks 6-9: Verify dubbing workflow end-to-end
- Task with German marketplace shows "Dub" button
- Click dub → processing state
- Dub completes → OneDrive has `content-german/{ASIN}_German.mov`
- Task shows dubbed video available

---

## Execution Order

```
Phase 1 (Sequential):
  Task 1 (schema) 
    → Task 2 (auto-link API)
    → Task 3 (task API with video)
    → Task 4 (frontend indicator)
    → Task 5 (view video)
    → VERIFY

Phase 2 (Sequential):
  Task 6 (variants schema)
    → Task 7 (dub API)
    → Task 8 (dub button)
    → Task 9 (view variant)
    → VERIFY
```

---

## Overall Rollback Strategy
1. Revert frontend changes
2. Drop `video_variants` table
3. Drop `marketplaces` table
4. Remove `video_id` column from `influencer_tasks`
5. Revert API changes

Video system continues working standalone.

---

## Ready for /implement: YES

---
*Created: 2026-01-21*
