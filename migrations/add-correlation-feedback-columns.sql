-- Add feedback columns to existing asin_correlations table
-- Simpler than a separate table - feedback tied directly to each correlation

ALTER TABLE asin_correlations 
  ADD COLUMN IF NOT EXISTS decision VARCHAR(20) CHECK (decision IN ('accepted', 'declined')),
  ADD COLUMN IF NOT EXISTS decline_reason VARCHAR(50),
  ADD COLUMN IF NOT EXISTS decision_at TIMESTAMPTZ;

-- Index for finding user's feedback history
CREATE INDEX IF NOT EXISTS idx_correlations_decision 
  ON asin_correlations(user_id, decision) 
  WHERE decision IS NOT NULL;

-- Add custom matching columns to users table (if not exists)
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS custom_matching_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_matching_prompt TEXT;
