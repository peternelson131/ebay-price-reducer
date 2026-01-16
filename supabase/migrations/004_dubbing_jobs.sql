-- Create dubbing_jobs table for Eleven Labs video dubbing
CREATE TABLE IF NOT EXISTS dubbing_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Eleven Labs dubbing info
  dubbing_id TEXT NOT NULL,
  source_language TEXT DEFAULT 'en',
  target_language TEXT NOT NULL,
  
  -- File info
  original_filename TEXT,
  file_size_bytes BIGINT,
  
  -- Status tracking
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  
  -- Storage
  storage_path TEXT,
  storage_url TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Indexes
  CONSTRAINT unique_dubbing_id UNIQUE (dubbing_id)
);

-- Create indexes for common queries
CREATE INDEX idx_dubbing_jobs_user_id ON dubbing_jobs(user_id);
CREATE INDEX idx_dubbing_jobs_status ON dubbing_jobs(status);
CREATE INDEX idx_dubbing_jobs_expires_at ON dubbing_jobs(expires_at);
CREATE INDEX idx_dubbing_jobs_created_at ON dubbing_jobs(created_at DESC);

-- Enable RLS
ALTER TABLE dubbing_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own dubbing jobs
CREATE POLICY "Users can view own dubbing jobs"
  ON dubbing_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own dubbing jobs
CREATE POLICY "Users can insert own dubbing jobs"
  ON dubbing_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own dubbing jobs
CREATE POLICY "Users can update own dubbing jobs"
  ON dubbing_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do anything (for cleanup job)
CREATE POLICY "Service role full access"
  ON dubbing_jobs FOR ALL
  USING (auth.role() = 'service_role');

-- Add comment
COMMENT ON TABLE dubbing_jobs IS 'Tracks Eleven Labs video dubbing jobs with 3-day file retention';
