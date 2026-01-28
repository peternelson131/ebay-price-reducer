-- Make "video made" a protected system field
-- Migration: 20260127_make_video_made_system_field
-- Context: Protect "video made" status from being deleted/modified and prevent duplicate user-created statuses

-- Step 1: Add is_system column to crm_statuses table
ALTER TABLE crm_statuses 
ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false;

-- Step 2: Mark all existing system statuses (user_id = NULL) as system fields
UPDATE crm_statuses 
SET is_system = true 
WHERE user_id IS NULL;

-- Step 3: Update "video made" sort order to position it correctly in workflow
-- Current workflow: Initial Contact(1) → Committed(2) → In Transit(3) → Delivered(4) → Completed(5) → Problem(6) → video made(7)
-- Desired workflow: Initial Contact(1) → Committed(2) → In Transit(3) → Video Made(4) → Delivered(5) → Completed(6) → Problem(7)
-- We need to shift statuses to make room for video made after In Transit:
-- - video made: 7 → 4 (after In Transit)
-- - Delivered: 4 → 5
-- - Completed: 5 → 6
-- - Problem: 6 → 7

-- Update in reverse order to avoid conflicts
UPDATE crm_statuses SET sort_order = 7 WHERE user_id IS NULL AND name = 'Problem';
UPDATE crm_statuses SET sort_order = 6 WHERE user_id IS NULL AND name = 'Completed';
UPDATE crm_statuses SET sort_order = 5 WHERE user_id IS NULL AND name = 'Delivered';
UPDATE crm_statuses SET sort_order = 4 WHERE user_id IS NULL AND name = 'video made';

-- Step 4: Update RLS policies to prevent users from modifying/deleting system statuses
-- Drop old policies
DROP POLICY IF EXISTS "Users can update own statuses" ON crm_statuses;
DROP POLICY IF EXISTS "Users can delete own statuses" ON crm_statuses;

-- Create new policies that exclude system statuses
CREATE POLICY "Users can update own non-system statuses" ON crm_statuses
  FOR UPDATE USING (user_id = auth.uid() AND is_system = false);

CREATE POLICY "Users can delete own non-system statuses" ON crm_statuses
  FOR DELETE USING (user_id = auth.uid() AND is_system = false);

-- Step 5: Add comment for documentation
COMMENT ON COLUMN crm_statuses.is_system IS 'System statuses (is_system=true) cannot be modified or deleted by users. Reserved names include: video made, Sourcing, Review, Negotiating, Committed, Ordered, Shipped, In Transit, Delivered, To Receive, Completed, Returned, Cancelled, Problem';

-- Step 6: Create a function to validate against reserved system status names
CREATE OR REPLACE FUNCTION check_reserved_status_name()
RETURNS TRIGGER AS $$
DECLARE
  reserved_names TEXT[] := ARRAY[
    'video made', 'sourcing', 'review', 'negotiating', 'committed', 
    'ordered', 'shipped', 'in transit', 'delivered', 'to receive', 
    'completed', 'returned', 'cancelled', 'problem'
  ];
BEGIN
  -- Only check for user-created statuses (not system ones)
  IF NEW.user_id IS NOT NULL AND NEW.is_system = false THEN
    -- Check if name (lowercase) matches any reserved name
    IF LOWER(NEW.name) = ANY(reserved_names) THEN
      RAISE EXCEPTION 'This status name is reserved by the system'
        USING HINT = 'Please choose a different name for your custom status';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create trigger to enforce reserved name validation
DROP TRIGGER IF EXISTS enforce_reserved_status_names ON crm_statuses;
CREATE TRIGGER enforce_reserved_status_names
  BEFORE INSERT OR UPDATE ON crm_statuses
  FOR EACH ROW
  EXECUTE FUNCTION check_reserved_status_name();

-- Step 8: Add constraint to ensure system statuses always have user_id = NULL
ALTER TABLE crm_statuses 
DROP CONSTRAINT IF EXISTS system_status_user_constraint;

ALTER TABLE crm_statuses 
ADD CONSTRAINT system_status_user_constraint 
CHECK (
  (is_system = true AND user_id IS NULL) OR 
  (is_system = false)
);

COMMENT ON CONSTRAINT system_status_user_constraint ON crm_statuses IS 'System statuses must have user_id = NULL';
