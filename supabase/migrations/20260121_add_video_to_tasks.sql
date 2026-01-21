-- Add video_id to influencer_tasks
-- Created: 2026-01-21
-- Purpose: Link influencer tasks to product videos for video-task association

-- =============================================================================
-- Add video_id column to influencer_tasks
-- =============================================================================
-- This column allows tasks to reference which video was created/uploaded for them

ALTER TABLE influencer_tasks 
  ADD COLUMN video_id UUID REFERENCES product_videos(id) ON DELETE SET NULL;

-- =============================================================================
-- Create index for video lookups
-- =============================================================================
-- Enables efficient queries to find tasks associated with a specific video

CREATE INDEX idx_influencer_tasks_video_id ON influencer_tasks(video_id);

-- =============================================================================
-- RLS Policy Update
-- =============================================================================
-- Note: Existing RLS policies on influencer_tasks already allow users to
-- SELECT/UPDATE their own tasks, which includes the video_id column.
-- The video_id will be visible/editable through existing policies:
--   - "Users can view own tasks" (SELECT)
--   - "Users can update own tasks" (UPDATE)
-- 
-- No additional RLS policy needed since the column is just a reference
-- and access is controlled by the existing user_id-based policies.

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON COLUMN influencer_tasks.video_id IS 'Reference to the product video uploaded for this task (nullable - existing tasks have no video)';
