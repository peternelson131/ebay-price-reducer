-- =====================================================
-- F-PRC002: Add reduction method columns
-- =====================================================
-- Adds columns to track whether reduction was percentage or dollar
-- and links to the strategy that was used
--
-- Run this on both UAT and Production Supabase instances
-- Date: 2026-01-12

-- Add reduction_method column (percentage vs dollar)
-- Note: existing reduction_type is for source (manual/scheduled/automated)
ALTER TABLE price_reduction_log 
ADD COLUMN IF NOT EXISTS reduction_method TEXT 
CHECK (reduction_method IN ('percentage', 'dollar'));

-- Add strategy_id foreign key
ALTER TABLE price_reduction_log 
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL;

-- Add index for strategy lookups
CREATE INDEX IF NOT EXISTS idx_price_reduction_log_strategy_id 
ON price_reduction_log(strategy_id);

-- Add comments
COMMENT ON COLUMN price_reduction_log.reduction_method IS 'How the reduction was calculated: percentage (% of price) or dollar (fixed amount)';
COMMENT ON COLUMN price_reduction_log.strategy_id IS 'Reference to the strategy that was used, if any';

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns 
WHERE table_name = 'price_reduction_log' 
AND column_name IN ('reduction_method', 'strategy_id');

DO $$
BEGIN
    RAISE NOTICE '✅ F-PRC002 migration complete - added reduction_method and strategy_id columns';
END $$;
