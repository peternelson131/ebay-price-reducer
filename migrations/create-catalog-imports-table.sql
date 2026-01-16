-- Migration: Create catalog_imports table for bulk ASIN import feature
-- Purpose: Allow users to import their existing Amazon Influencer catalog
--          for correlation analysis (find variations/similar products)

-- Create the catalog_imports table
CREATE TABLE IF NOT EXISTS catalog_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- ASIN info from Excel/CSV upload
  asin TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  category TEXT,
  price DECIMAL(10, 2),
  
  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'error', 'skipped')),
  
  -- Correlation results
  correlation_count INTEGER DEFAULT 0,
  correlations JSONB,  -- Array of found variations/similar items
  
  -- Error tracking
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  
  -- Prevent duplicate ASINs per user
  CONSTRAINT unique_user_catalog_asin UNIQUE (user_id, asin)
);

-- Create import_batch table to track upload batches
CREATE TABLE IF NOT EXISTS catalog_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Batch statistics
  filename TEXT,
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  
  -- Batch status
  status TEXT DEFAULT 'completed' CHECK (status IN ('uploading', 'completed', 'error')),
  error_message TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_catalog_imports_user_id ON catalog_imports(user_id);
CREATE INDEX idx_catalog_imports_status ON catalog_imports(status);
CREATE INDEX idx_catalog_imports_user_status ON catalog_imports(user_id, status);
CREATE INDEX idx_catalog_imports_asin ON catalog_imports(asin);
CREATE INDEX idx_catalog_imports_created ON catalog_imports(created_at DESC);

CREATE INDEX idx_catalog_import_batches_user ON catalog_import_batches(user_id);
CREATE INDEX idx_catalog_import_batches_created ON catalog_import_batches(created_at DESC);

-- Enable Row Level Security
ALTER TABLE catalog_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_import_batches ENABLE ROW LEVEL SECURITY;

-- RLS Policies for catalog_imports
-- Users can only see their own imports
CREATE POLICY "Users can view own catalog imports"
  ON catalog_imports FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own imports
CREATE POLICY "Users can insert own catalog imports"
  ON catalog_imports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own imports
CREATE POLICY "Users can update own catalog imports"
  ON catalog_imports FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own imports
CREATE POLICY "Users can delete own catalog imports"
  ON catalog_imports FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for catalog_import_batches
CREATE POLICY "Users can view own import batches"
  ON catalog_import_batches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own import batches"
  ON catalog_import_batches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON catalog_imports TO authenticated;
GRANT ALL ON catalog_imports TO service_role;
GRANT ALL ON catalog_import_batches TO authenticated;
GRANT ALL ON catalog_import_batches TO service_role;

-- Add comments
COMMENT ON TABLE catalog_imports IS 'Stores imported Amazon Influencer ASINs for correlation analysis';
COMMENT ON TABLE catalog_import_batches IS 'Tracks batch imports from Excel/CSV uploads';
COMMENT ON COLUMN catalog_imports.correlations IS 'JSON array of correlated ASINs with title, image, score, etc.';
COMMENT ON COLUMN catalog_imports.status IS 'pending=awaiting processing, processing=being analyzed, processed=done, error=failed, skipped=already exists';
