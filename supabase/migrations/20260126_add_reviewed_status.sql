-- Add 'reviewed' status to catalog_imports
-- Migration: 20260126_add_reviewed_status
-- Purpose: Allow users to mark processed items as "reviewed" after accepting/declining correlations

-- Step 1: Drop existing constraint
ALTER TABLE catalog_imports 
DROP CONSTRAINT IF EXISTS catalog_imports_status_check;

-- Step 2: Add new constraint with 'reviewed' status
ALTER TABLE catalog_imports 
ADD CONSTRAINT catalog_imports_status_check 
CHECK (status IN ('imported', 'processed', 'reviewed'));

-- Update comment
COMMENT ON COLUMN catalog_imports.status IS 'imported=awaiting sync, processed=synced with correlations, reviewed=user has reviewed correlations';
