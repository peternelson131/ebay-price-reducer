-- Add uploaded_usa column to track Amazon Influencer uploads
ALTER TABLE asin_correlations 
  ADD COLUMN IF NOT EXISTS uploaded_usa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploaded_usa_at TIMESTAMPTZ;

-- Index for finding uploaded items
CREATE INDEX IF NOT EXISTS idx_correlations_uploaded_usa 
  ON asin_correlations(user_id, uploaded_usa) 
  WHERE uploaded_usa = true;
