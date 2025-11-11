-- Migration: Add unique constraint on strategy names per user
-- This prevents users from creating multiple strategies with the same name
-- which can cause confusion when selecting strategies for listings

-- Add unique constraint if it doesn't already exist
-- Note: This will fail if there are existing duplicate strategy names
-- If duplicates exist, you'll need to manually rename them first

DO $$
BEGIN
    -- Check if constraint already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'unique_user_strategy_name'
    ) THEN
        -- Add the constraint
        ALTER TABLE strategies
        ADD CONSTRAINT unique_user_strategy_name UNIQUE (user_id, name);

        RAISE NOTICE 'Unique constraint added successfully';
    ELSE
        RAISE NOTICE 'Constraint already exists, skipping';
    END IF;
END $$;

-- Optional: Query to find existing duplicates (run this first if the migration fails)
-- SELECT user_id, name, COUNT(*)
-- FROM strategies
-- GROUP BY user_id, name
-- HAVING COUNT(*) > 1;
