-- Simplify catalog_imports status from 5 states to 2 states
-- Migration: 20260126_simplify_catalog_status

-- Step 1: Migrate existing data to new statuses
-- pending, processing, error, skipped → imported (can be re-synced)
UPDATE catalog_imports 
SET status = 'imported' 
WHERE status IN ('pending', 'processing', 'error', 'skipped');

-- Step 2: Drop old constraint
ALTER TABLE catalog_imports 
DROP CONSTRAINT IF EXISTS catalog_imports_status_check;

-- Step 3: Add new simplified constraint
ALTER TABLE catalog_imports 
ADD CONSTRAINT catalog_imports_status_check 
CHECK (status IN ('imported', 'processed'));

-- Step 4: Update default
ALTER TABLE catalog_imports 
ALTER COLUMN status SET DEFAULT 'imported';

-- Update comment
COMMENT ON COLUMN catalog_imports.status IS 'imported=awaiting sync, processed=synced with correlations available';
