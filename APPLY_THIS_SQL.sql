-- =====================================================
-- SYSTEM STATUS PROTECTION MIGRATION
-- Copy and paste this into Supabase SQL Editor
-- =====================================================
-- This migration makes "video made" and other system 
-- statuses protected from user modification.
-- =====================================================

-- Step 1: Add is_system column
ALTER TABLE crm_statuses 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Step 2: Mark all system statuses (user_id = NULL)
UPDATE crm_statuses 
SET is_system = true 
WHERE user_id IS NULL;

-- Step 3: Update RLS policies to prevent modification
DROP POLICY IF EXISTS "Users can update own statuses" ON crm_statuses;
DROP POLICY IF EXISTS "Users can delete own statuses" ON crm_statuses;

CREATE POLICY "Users can update own non-system statuses" ON crm_statuses
  FOR UPDATE USING (user_id = auth.uid() AND is_system = false);

CREATE POLICY "Users can delete own non-system statuses" ON crm_statuses
  FOR DELETE USING (user_id = auth.uid() AND is_system = false);

-- Step 4: Add documentation
COMMENT ON COLUMN crm_statuses.is_system IS 'System statuses (is_system=true) cannot be modified or deleted by users. Reserved names: video made, Initial Contact, Committed, In Transit, Delivered, Completed, Problem';

-- Step 5: Create reserved name validation function
CREATE OR REPLACE FUNCTION check_reserved_status_name()
RETURNS TRIGGER AS $$
DECLARE
  reserved_names TEXT[] := ARRAY[
    'video made', 'initial contact', 'committed', 'in transit',
    'delivered', 'completed', 'problem', 'sourcing', 'review',
    'negotiating', 'ordered', 'shipped', 'to receive', 'returned',
    'cancelled'
  ];
BEGIN
  -- Only check for user-created statuses
  IF NEW.user_id IS NOT NULL AND (NEW.is_system IS NULL OR NEW.is_system = false) THEN
    -- Check if name (lowercase) matches any reserved name
    IF LOWER(NEW.name) = ANY(reserved_names) THEN
      RAISE EXCEPTION 'This status name is reserved by the system'
        USING HINT = 'Please choose a different name for your custom status';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger to enforce validation
DROP TRIGGER IF EXISTS enforce_reserved_status_names ON crm_statuses;
CREATE TRIGGER enforce_reserved_status_names
  BEFORE INSERT OR UPDATE ON crm_statuses
  FOR EACH ROW
  EXECUTE FUNCTION check_reserved_status_name();

-- Step 7: Add constraint for system status integrity
ALTER TABLE crm_statuses 
DROP CONSTRAINT IF EXISTS system_status_user_constraint;

ALTER TABLE crm_statuses 
ADD CONSTRAINT system_status_user_constraint 
CHECK (
  (is_system = true AND user_id IS NULL) OR 
  (is_system = false) OR
  (is_system IS NULL)
);

COMMENT ON CONSTRAINT system_status_user_constraint ON crm_statuses 
IS 'System statuses must have user_id = NULL';

-- =====================================================
-- DONE! You can now close this SQL editor.
-- Run: node apply-system-status-migration.js
-- to verify everything works.
-- =====================================================
