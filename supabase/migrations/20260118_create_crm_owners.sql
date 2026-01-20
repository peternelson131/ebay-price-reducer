-- =============================================
-- CRM Owners Table
-- Migration: 20260118_create_crm_owners
-- Purpose: User-customizable owner names for product assignments
-- =============================================

-- 1. Create crm_owners table (user's custom owner list)
CREATE TABLE IF NOT EXISTS crm_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,  -- optional contact email
  avatar_color TEXT DEFAULT '#3B82F6',  -- for display avatar
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 2. Enable RLS
ALTER TABLE crm_owners ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
CREATE POLICY "Users can view their own owners" ON crm_owners
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own owners" ON crm_owners
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own owners" ON crm_owners
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own owners" ON crm_owners
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_crm_owners_user_id ON crm_owners(user_id);

-- 5. Update product_owners to reference crm_owners instead of auth.users
-- First, drop the old foreign key constraint if it exists
DO $$
BEGIN
  -- Check if the constraint exists before trying to drop it
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'product_owners_owner_id_fkey'
    AND table_name = 'product_owners'
  ) THEN
    ALTER TABLE product_owners DROP CONSTRAINT product_owners_owner_id_fkey;
  END IF;
END $$;

-- Add new foreign key to crm_owners
-- Note: This will fail if there's existing data pointing to auth.users
-- In that case, the data needs to be migrated first
DO $$
BEGIN
  -- Only add the constraint if crm_owners table exists and product_owners exists
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_owners') THEN
    -- Clear any orphaned owner references first (they were referencing auth.users which won't match crm_owners)
    DELETE FROM product_owners WHERE owner_id NOT IN (SELECT id FROM crm_owners);
    
    -- Add new foreign key
    ALTER TABLE product_owners 
      ADD CONSTRAINT product_owners_owner_id_fkey 
      FOREIGN KEY (owner_id) REFERENCES crm_owners(id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add foreign key constraint: %', SQLERRM;
END $$;

-- 6. Grant permissions
GRANT ALL ON crm_owners TO authenticated;
