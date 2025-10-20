-- Migration: Add Category-Specific Condition Support
-- Purpose: Store allowed item conditions for each eBay category to prevent
--          "invalid condition for category" errors
-- Created: 2025-10-19
--
-- PROBLEM: eBay conditions are category-specific, not universal. Using hardcoded
--          conditions causes errors like "The provided condition id is invalid for
--          the selected primary category id."
--
-- SOLUTION: Fetch category-specific allowed conditions from eBay Metadata API
--          and cache them alongside category aspects.

-- Add columns to store condition metadata
ALTER TABLE ebay_category_aspects
ADD COLUMN IF NOT EXISTS allowed_conditions JSONB,
ADD COLUMN IF NOT EXISTS condition_required BOOLEAN DEFAULT false;

-- Add index for condition queries (GIN index for JSONB)
CREATE INDEX IF NOT EXISTS idx_category_aspects_conditions
ON ebay_category_aspects USING GIN(allowed_conditions);

-- Add comments to document the schema
COMMENT ON COLUMN ebay_category_aspects.allowed_conditions IS
'Array of allowed item conditions for this category from eBay Metadata API getItemConditionPolicies. Format: [{"conditionId": "1000", "conditionDescription": "New"}, ...]';

COMMENT ON COLUMN ebay_category_aspects.condition_required IS
'Whether item condition is required for this category (from eBay Metadata API)';

-- Display current cache status
SELECT
  category_id,
  category_name,
  allowed_conditions IS NOT NULL as has_conditions,
  condition_required,
  CASE
    WHEN allowed_conditions IS NULL THEN 'No conditions cached'
    ELSE jsonb_array_length(allowed_conditions) || ' conditions available'
  END as condition_count,
  expires_at,
  CASE
    WHEN expires_at < NOW() THEN 'EXPIRED - will refresh on next use'
    ELSE 'Valid for ' || EXTRACT(DAY FROM (expires_at - NOW())) || ' days'
  END as cache_status
FROM ebay_category_aspects
ORDER BY last_fetched_at DESC
LIMIT 20;
