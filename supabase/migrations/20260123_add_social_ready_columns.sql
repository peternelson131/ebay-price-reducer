-- Pre-Upload Architecture: Add social-ready status tracking to product_videos
-- Created: 2026-01-23
-- Purpose: Track pre-transcoded videos in Supabase Storage for instant social posting

-- =============================================================================
-- Add social_ready columns to product_videos table
-- =============================================================================

-- Add social_ready_url column (stores public URL of transcoded video in Supabase Storage)
ALTER TABLE product_videos 
ADD COLUMN IF NOT EXISTS social_ready_url TEXT;

-- Add social_ready_status column with constraint
ALTER TABLE product_videos 
ADD COLUMN IF NOT EXISTS social_ready_status TEXT DEFAULT 'pending' 
CHECK (social_ready_status IN ('pending', 'processing', 'ready', 'failed'));

-- Add timestamp for when video became ready
ALTER TABLE product_videos 
ADD COLUMN IF NOT EXISTS social_ready_at TIMESTAMPTZ;

-- Add error message field for troubleshooting failed transcodes
ALTER TABLE product_videos 
ADD COLUMN IF NOT EXISTS social_ready_error TEXT;

-- =============================================================================
-- Indexes for performance
-- =============================================================================

-- Index for querying videos by ready status (used by background jobs)
CREATE INDEX IF NOT EXISTS idx_product_videos_social_ready_status 
ON product_videos(social_ready_status) 
WHERE social_ready_status IN ('pending', 'processing');

-- Index for finding ready videos
CREATE INDEX IF NOT EXISTS idx_product_videos_ready 
ON product_videos(social_ready_status, user_id) 
WHERE social_ready_status = 'ready';

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON COLUMN product_videos.social_ready_url IS 'Public URL of transcoded video in Supabase Storage (transcoded-videos bucket) - used for instant social posting';
COMMENT ON COLUMN product_videos.social_ready_status IS 'Status of social-ready transcode: pending (not started), processing (transcoding now), ready (available), failed (error occurred)';
COMMENT ON COLUMN product_videos.social_ready_at IS 'Timestamp when video became ready for social posting';
COMMENT ON COLUMN product_videos.social_ready_error IS 'Error message if transcoding failed';

-- =============================================================================
-- Storage Bucket Setup Instructions
-- =============================================================================

-- MANUAL STEP REQUIRED:
-- Create Supabase Storage bucket "transcoded-videos" in the Supabase dashboard
-- 
-- Settings:
--   - Bucket name: transcoded-videos
--   - Public: Yes (Instagram/Facebook need direct URL access)
--   - File size limit: 100MB (supports social media video requirements)
--   - Allowed MIME types: video/mp4, video/quicktime
--
-- RLS Policy for Public Read:
-- CREATE POLICY "Public can read transcoded videos"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'transcoded-videos');
--
-- RLS Policy for Authenticated Insert:
-- CREATE POLICY "Authenticated users can upload transcoded videos"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'transcoded-videos' AND auth.role() = 'authenticated');
--
-- File structure: {user_id}/{video_id}.mp4
-- Example: 550e8400-e29b-41d4-a716-446655440000/abc123.mp4

-- =============================================================================
-- Migration Notes
-- =============================================================================

-- This migration is backward compatible:
-- - All new columns are nullable
-- - Default status is 'pending' for new videos
-- - Existing videos will have NULL social_ready_url and 'pending' status
-- - On-demand transcoding in social-post-processor continues to work as fallback
--
-- Rollback:
-- ALTER TABLE product_videos DROP COLUMN IF EXISTS social_ready_url;
-- ALTER TABLE product_videos DROP COLUMN IF EXISTS social_ready_status;
-- ALTER TABLE product_videos DROP COLUMN IF EXISTS social_ready_at;
-- ALTER TABLE product_videos DROP COLUMN IF EXISTS social_ready_error;
-- DROP INDEX IF EXISTS idx_product_videos_social_ready_status;
-- DROP INDEX IF EXISTS idx_product_videos_ready;
