-- Import Jobs Table for Background Processing
-- Tracks batch import jobs for ASIN correlation

CREATE TABLE IF NOT EXISTS import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  search_asin VARCHAR(10) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_count INTEGER NOT NULL DEFAULT 0,
  processed_count INTEGER NOT NULL DEFAULT 0,
  approved_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Index for quick user lookups
CREATE INDEX IF NOT EXISTS idx_import_jobs_user_status 
  ON import_jobs(user_id, status);

-- Index for recent jobs
CREATE INDEX IF NOT EXISTS idx_import_jobs_created 
  ON import_jobs(created_at DESC);

-- RLS Policies
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view own import jobs"
  ON import_jobs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own import jobs"
  ON import_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own jobs
CREATE POLICY "Users can update own import jobs"
  ON import_jobs FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do anything (for background functions)
CREATE POLICY "Service role full access"
  ON import_jobs
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_import_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER import_jobs_updated_at
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_import_jobs_updated_at();

-- Grant permissions
GRANT ALL ON import_jobs TO authenticated;
GRANT ALL ON import_jobs TO service_role;
