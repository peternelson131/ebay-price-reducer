-- Social Post Jobs Table for Async Processing
-- Allows large videos to process in background without timing out

CREATE TABLE social_post_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  video_id UUID REFERENCES product_videos(id) ON DELETE CASCADE NOT NULL,
  platforms JSONB NOT NULL, -- ["youtube", "facebook", "instagram"]
  title TEXT,
  description TEXT,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  results JSONB, -- {youtube: {success: true, url: "..."}, facebook: {...}, ...}
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX idx_social_post_jobs_user_id ON social_post_jobs(user_id);
CREATE INDEX idx_social_post_jobs_status ON social_post_jobs(status);
CREATE INDEX idx_social_post_jobs_video_id ON social_post_jobs(video_id);
CREATE INDEX idx_social_post_jobs_created_at ON social_post_jobs(created_at DESC);

-- RLS policies
ALTER TABLE social_post_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own jobs" 
  ON social_post_jobs 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own jobs" 
  ON social_post_jobs 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Optional: Allow users to update their own jobs (for cancellation in future)
CREATE POLICY "Users can update own jobs" 
  ON social_post_jobs 
  FOR UPDATE 
  USING (auth.uid() = user_id);

COMMENT ON TABLE social_post_jobs IS 'Background job queue for social media posting to handle large videos without timeout';
COMMENT ON COLUMN social_post_jobs.platforms IS 'Array of platform names: ["youtube", "facebook", "instagram"]';
COMMENT ON COLUMN social_post_jobs.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN social_post_jobs.results IS 'Per-platform results object with success/error/url info';
