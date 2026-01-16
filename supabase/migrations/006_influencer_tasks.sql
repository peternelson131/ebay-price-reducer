-- Create influencer_tasks table for tracking video upload tasks
CREATE TABLE IF NOT EXISTS influencer_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_id UUID REFERENCES asin_correlation_feedback(id) ON DELETE CASCADE,
  
  -- ASIN info
  asin TEXT NOT NULL,
  title TEXT,
  
  -- Marketplace (US, CA, DE, UK)
  marketplace TEXT NOT NULL CHECK (marketplace IN ('US', 'CA', 'DE', 'UK')),
  
  -- Status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  
  -- Amazon Influencer upload URL
  amazon_upload_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Prevent duplicate tasks for same ASIN/marketplace
  CONSTRAINT unique_user_asin_marketplace UNIQUE (user_id, asin, marketplace)
);

-- Create indexes
CREATE INDEX idx_influencer_tasks_user_id ON influencer_tasks(user_id);
CREATE INDEX idx_influencer_tasks_status ON influencer_tasks(status);
CREATE INDEX idx_influencer_tasks_asin ON influencer_tasks(asin);
CREATE INDEX idx_influencer_tasks_feedback_id ON influencer_tasks(feedback_id);

-- Enable RLS
ALTER TABLE influencer_tasks ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tasks
CREATE POLICY "Users can view own tasks"
  ON influencer_tasks FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own tasks
CREATE POLICY "Users can insert own tasks"
  ON influencer_tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own tasks
CREATE POLICY "Users can update own tasks"
  ON influencer_tasks FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own tasks
CREATE POLICY "Users can delete own tasks"
  ON influencer_tasks FOR DELETE
  USING (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE influencer_tasks IS 'Tracks Amazon Influencer video upload tasks for accepted ASIN correlations';
