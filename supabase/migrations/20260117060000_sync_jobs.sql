-- Migration: Create sync_jobs table for background job processing
-- This allows async sync operations that don't block the UI

CREATE TABLE IF NOT EXISTS sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL DEFAULT 'catalog_sync',  -- catalog_sync, correlation_sync, etc.
    status TEXT NOT NULL DEFAULT 'pending',  -- pending, processing, completed, failed
    
    -- Job parameters
    total_items INTEGER DEFAULT 0,
    processed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    
    -- Detailed results
    results JSONB DEFAULT '[]'::jsonb,  -- Array of {asin, status, correlations, error}
    error_message TEXT,
    
    -- Timing
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- For filtering
    metadata JSONB DEFAULT '{}'::jsonb  -- Additional job-specific data
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_id ON sync_jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_created_at ON sync_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_jobs_user_status ON sync_jobs(user_id, status);

-- RLS policies
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own jobs
CREATE POLICY "Users can view own sync jobs" ON sync_jobs
    FOR SELECT USING (auth.uid() = user_id);

-- Users can create their own jobs
CREATE POLICY "Users can create own sync jobs" ON sync_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for background processing)
CREATE POLICY "Service role full access" ON sync_jobs
    FOR ALL USING (auth.role() = 'service_role');

-- Grant access
GRANT SELECT, INSERT, UPDATE ON sync_jobs TO authenticated;
GRANT ALL ON sync_jobs TO service_role;

-- Comment for documentation
COMMENT ON TABLE sync_jobs IS 'Background job tracking for async sync operations';
COMMENT ON COLUMN sync_jobs.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN sync_jobs.results IS 'Array of per-item results with asin, status, correlations, error';
