-- Migration: Create dubbing_jobs table for Eleven Labs video dubbing
-- Created: 2025-01-16

-- Table to track video dubbing jobs
CREATE TABLE IF NOT EXISTS dubbing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    dubbing_id TEXT NOT NULL,
    source_language TEXT NOT NULL DEFAULT 'en',
    target_language TEXT NOT NULL,
    original_filename TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    storage_url TEXT,
    storage_path TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT unique_dubbing_id UNIQUE (dubbing_id)
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_dubbing_jobs_user_id ON dubbing_jobs(user_id);

-- Index for cleanup queries (find expired videos)
CREATE INDEX IF NOT EXISTS idx_dubbing_jobs_expires_at ON dubbing_jobs(expires_at) WHERE expires_at IS NOT NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_dubbing_jobs_status ON dubbing_jobs(status);

-- Enable RLS
ALTER TABLE dubbing_jobs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own dubbing jobs
CREATE POLICY "Users can view own dubbing jobs"
    ON dubbing_jobs FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own dubbing jobs
CREATE POLICY "Users can create dubbing jobs"
    ON dubbing_jobs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own dubbing jobs
CREATE POLICY "Users can update own dubbing jobs"
    ON dubbing_jobs FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Service role can do anything (for scheduled functions)
CREATE POLICY "Service role full access"
    ON dubbing_jobs FOR ALL
    USING (auth.role() = 'service_role');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_dubbing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_dubbing_jobs_updated_at
    BEFORE UPDATE ON dubbing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_dubbing_jobs_updated_at();

-- Comment on table
COMMENT ON TABLE dubbing_jobs IS 'Tracks Eleven Labs video dubbing jobs for users';
COMMENT ON COLUMN dubbing_jobs.dubbing_id IS 'Eleven Labs dubbing job ID';
COMMENT ON COLUMN dubbing_jobs.source_language IS 'Original video language (default: English)';
COMMENT ON COLUMN dubbing_jobs.target_language IS 'Target language for dubbing';
COMMENT ON COLUMN dubbing_jobs.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN dubbing_jobs.storage_url IS 'Public URL to download dubbed video from Supabase Storage';
COMMENT ON COLUMN dubbing_jobs.storage_path IS 'Path in Supabase Storage bucket';
COMMENT ON COLUMN dubbing_jobs.expires_at IS 'When the video will be deleted (3 days after completion)';
