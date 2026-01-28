# Feature: Video Inheritance for Correlated ASINs

**Date:** 2026-01-28
**Status:** Spec Ready
**Priority:** HIGH

---

## Problem Statement

When a video is uploaded to a "search ASIN" (parent), the correlated ASINs (children) should automatically inherit that video association. Currently, correlated ASINs have `video_id = null` even when their search ASIN has a video.

### Example
- **Search ASIN:** B0FY6XK7TF (has video `af35270b-889a-41fd-9977-45765f6f0352`)
- **Correlated ASINs:** 
  - B0GCDJF3CW (has `search_asin = B0FY6XK7TF` but `video_id = null`)
  - B0FY6T3ZK9 (has `search_asin = B0FY6XK7TF` but `video_id = null`)

**Expected:** B0GCDJF3CW and B0FY6T3ZK9 should show as having a video and appear in Chrome extension for upload.

---

## Current Schema

```sql
-- influencer_tasks table
id UUID
user_id UUID
asin TEXT           -- The specific ASIN for this task
search_asin TEXT    -- The parent/search ASIN (same as asin for main task)
video_id UUID       -- Currently only set on the search ASIN task
status TEXT         -- pending, completed, etc.
marketplace TEXT    -- US, CA, UK, etc.
```

**Relationship:**
- Main task: `asin = search_asin` (e.g., B0FY6XK7TF = B0FY6XK7TF)
- Correlated task: `asin != search_asin` (e.g., B0GCDJF3CW with search_asin B0FY6XK7TF)

---

## Proposed Solution

### Option A: Propagate video_id to correlated tasks (Recommended)

When a video is associated with a search ASIN:
1. Update the main task's `video_id`
2. **Also update all correlated tasks** (same `search_asin`, different `asin`)

**Trigger Points:**
1. When video is uploaded via `POST /videos` (existing flow)
2. When task is created with video_id
3. Database trigger on `influencer_tasks` UPDATE

**Implementation:**

```javascript
// In videos.js - after setting video_id on main task
async function propagateVideoToCorrelatedTasks(searchAsin, videoId, userId) {
  const { error } = await supabase
    .from('influencer_tasks')
    .update({ video_id: videoId })
    .eq('search_asin', searchAsin)
    .eq('user_id', userId)
    .is('video_id', null);  // Only update tasks without video
  
  if (error) {
    console.error('Failed to propagate video to correlated tasks:', error);
  }
}
```

### Option B: Query-time inheritance (Alternative)

Instead of storing `video_id` on correlated tasks, modify queries to inherit from search ASIN:

```sql
SELECT 
  it.*,
  COALESCE(it.video_id, parent.video_id) as effective_video_id
FROM influencer_tasks it
LEFT JOIN influencer_tasks parent 
  ON parent.asin = it.search_asin 
  AND parent.user_id = it.user_id
  AND parent.asin = parent.search_asin  -- parent is the main task
```

**Pros:** No data duplication
**Cons:** More complex queries, Chrome extension needs update

---

## Recommended Implementation (Option A)

### Step 1: Backend - Update `videos.js`

After creating influencer task for main ASIN, propagate to correlated tasks:

```javascript
// After creating task for main ASIN
if (tasksCreated > 0 && productAsin) {
  // Propagate video_id to any existing correlated tasks
  await propagateVideoToCorrelatedTasks(productAsin, videoId, userId);
}
```

### Step 2: Backfill existing data

Create a migration/script to update existing correlated tasks:

```sql
-- Update correlated tasks to inherit video_id from their search ASIN
UPDATE influencer_tasks child
SET video_id = parent.video_id
FROM influencer_tasks parent
WHERE child.search_asin = parent.asin
  AND parent.asin = parent.search_asin  -- parent is main task
  AND parent.video_id IS NOT NULL
  AND child.video_id IS NULL
  AND child.user_id = parent.user_id;
```

### Step 3: Database trigger (optional, for future-proofing)

```sql
CREATE OR REPLACE FUNCTION propagate_video_to_correlated()
RETURNS TRIGGER AS $$
BEGIN
  -- When video_id is set on a main task (asin = search_asin)
  IF NEW.video_id IS NOT NULL 
     AND NEW.asin = NEW.search_asin 
     AND (OLD.video_id IS NULL OR OLD.video_id != NEW.video_id) THEN
    
    UPDATE influencer_tasks
    SET video_id = NEW.video_id
    WHERE search_asin = NEW.asin
      AND user_id = NEW.user_id
      AND video_id IS NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER propagate_video_trigger
AFTER UPDATE ON influencer_tasks
FOR EACH ROW
EXECUTE FUNCTION propagate_video_to_correlated();
```

---

## Chrome Extension Impact

**No changes needed** if Option A is implemented - correlated tasks will have `video_id` populated and will appear in the task list automatically.

---

## Acceptance Criteria

1. [ ] When video is uploaded to search ASIN, all correlated ASINs get same `video_id`
2. [ ] Correlated ASINs appear in Chrome extension task list with video indicator
3. [ ] Download button works for correlated ASINs (same video, same thumbnail)
4. [ ] Existing correlated tasks are backfilled with video_id
5. [ ] New correlated tasks automatically inherit video_id

---

## Test Cases

| Search ASIN | Correlated ASIN | Video Upload | Expected Result |
|-------------|-----------------|--------------|-----------------|
| B0FY6XK7TF | B0GCDJF3CW | Video to B0FY6XK7TF | B0GCDJF3CW.video_id = same as parent |
| B0FY6XK7TF | B0FY6T3ZK9 | Video to B0FY6XK7TF | B0FY6T3ZK9.video_id = same as parent |
| B0FY6XK7TF | - | Video to B0FY6XK7TF | Main task has video_id |

---

## Files to Modify

1. `netlify/functions/videos.js` - Add propagation after task creation
2. `supabase/migrations/YYYYMMDD_propagate_video_to_correlated.sql` - Backfill + trigger
3. (Optional) Chrome extension if query-time inheritance chosen

---

## Estimated Effort

- Backend changes: 30 minutes
- Migration/backfill: 15 minutes
- Testing: 30 minutes
- **Total: ~1.5 hours**
