# Supabase SQL Changes Summary

## Overview
This document contains all SQL changes needed for the eBay Price Reducer strategies feature to work correctly.

---

## ✅ CHANGE 1: Add Unique Constraint on Strategy Names

**Purpose**: Prevent users from creating duplicate strategy names, which causes confusion when selecting strategies.

**Status**: ⏳ NEEDS TO BE RUN

**SQL to Execute:**

```sql
-- Add unique constraint on strategy names per user
-- This prevents duplicate strategy names which cause confusion

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
```

**How to Run:**
1. Open Supabase Dashboard
2. Go to SQL Editor
3. Paste the SQL above
4. Click "Run"

**Verification:**
After running, try creating two strategies with the same name - you should get an error.

---

## ✅ CHANGE 2: Verify Strategies Table Schema

**Purpose**: Ensure the strategies table has the correct columns matching the frontend code.

**Status**: ⏳ VERIFY THIS EXISTS

**Expected Schema:**

```sql
-- Verify your strategies table has these columns:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'strategies'
ORDER BY ordinal_position;
```

**Required Columns:**
- `id` - UUID (primary key)
- `user_id` - UUID (references auth.users)
- `name` - TEXT (required)
- `description` - TEXT (nullable)
- `strategy_type` - TEXT (default: 'percentage')
- `reduction_percentage` - NUMERIC
- `reduction_amount` - NUMERIC
- `interval_days` - INTEGER (default: 7)
- `stop_at_sell` - BOOLEAN (default: true)
- `created_at` - TIMESTAMPTZ
- `updated_at` - TIMESTAMPTZ

**If Strategies Table Doesn't Exist**, run this:

```sql
-- Create strategies table
CREATE TABLE IF NOT EXISTS strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  strategy_type TEXT NOT NULL DEFAULT 'percentage' CHECK (strategy_type IN ('percentage', 'dollar')),
  reduction_percentage NUMERIC(10, 2) DEFAULT 0,
  reduction_amount NUMERIC(10, 2) DEFAULT 0,
  interval_days INTEGER NOT NULL DEFAULT 7 CHECK (interval_days > 0),
  stop_at_sell BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_strategies_user_id ON strategies(user_id);
CREATE INDEX IF NOT EXISTS idx_strategies_created_at ON strategies(created_at DESC);

-- Enable Row Level Security
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own strategies
CREATE POLICY "Users can view own strategies"
  ON strategies
  FOR SELECT
  USING (auth.uid() = user_id);

-- RLS Policy: Users can create their own strategies
CREATE POLICY "Users can create own strategies"
  ON strategies
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can update their own strategies
CREATE POLICY "Users can update own strategies"
  ON strategies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RLS Policy: Users can delete their own strategies (only if not in use)
CREATE POLICY "Users can delete own strategies"
  ON strategies
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM listings
      WHERE listings.strategy_id = strategies.id
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_strategies_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_strategies_timestamp
  BEFORE UPDATE ON strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_strategies_updated_at();
```

---

## ✅ CHANGE 3: Verify Listings Table Has strategy_id Column

**Purpose**: Listings need to be able to reference strategies.

**Status**: ⏳ VERIFY THIS EXISTS

**Verification SQL:**

```sql
-- Check if strategy_id column exists in listings table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'listings'
AND column_name = 'strategy_id';
```

**If Column Doesn't Exist**, run this:

```sql
-- Add strategy_id column to listings table
ALTER TABLE listings
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id) ON DELETE SET NULL;

-- Create index on listings.strategy_id for performance
CREATE INDEX IF NOT EXISTS idx_listings_strategy_id ON listings(strategy_id);
```

---

## 🔍 VERIFICATION QUERIES

After running all changes, verify everything works:

### 1. Check Strategies Table Exists and Has Correct Schema

```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'strategies'
ORDER BY ordinal_position;
```

**Expected Output:** Should show all columns listed in CHANGE 2

### 2. Check Unique Constraint Exists

```sql
SELECT
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
WHERE rel.relname = 'strategies'
AND con.conname = 'unique_user_strategy_name';
```

**Expected Output:** Should show the unique constraint on (user_id, name)

### 3. Check Listings Table Has strategy_id Column

```sql
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'listings'
AND column_name = 'strategy_id';
```

**Expected Output:** strategy_id | uuid | YES

### 4. Check RLS Policies Exist

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  cmd
FROM pg_policies
WHERE tablename = 'strategies';
```

**Expected Output:** Should show 4 policies (SELECT, INSERT, UPDATE, DELETE)

### 5. Test Creating a Strategy (Optional)

```sql
-- This will only work if you're authenticated in Supabase
-- Replace the user_id with your actual user ID

INSERT INTO strategies (user_id, name, strategy_type, reduction_percentage, interval_days, stop_at_sell)
VALUES (
  auth.uid(),  -- This gets your current user ID
  'Test Strategy',
  'percentage',
  10,
  7,
  true
)
RETURNING *;
```

### 6. Test Unique Constraint (Optional)

Try running the same INSERT twice - the second one should fail with:
```
ERROR: duplicate key value violates unique constraint "unique_user_strategy_name"
```

---

## 📋 EXECUTION CHECKLIST

Run these in order:

- [ ] 1. Verify strategies table exists (CHANGE 2)
- [ ] 2. If not, create strategies table (CHANGE 2)
- [ ] 3. Verify listings.strategy_id column exists (CHANGE 3)
- [ ] 4. If not, add strategy_id column (CHANGE 3)
- [ ] 5. Add unique constraint on strategy names (CHANGE 1)
- [ ] 6. Run all verification queries
- [ ] 7. Test creating a strategy from the UI
- [ ] 8. Test assigning a strategy to a listing

---

## ⚠️ IMPORTANT NOTES

1. **Check for Existing Duplicates First**: Before adding the unique constraint, check if there are any duplicate strategy names:

```sql
-- Find duplicate strategy names
SELECT user_id, name, COUNT(*)
FROM strategies
GROUP BY user_id, name
HAVING COUNT(*) > 1;
```

If duplicates exist, rename them first:

```sql
-- Rename duplicates by appending a number
UPDATE strategies
SET name = name || ' (2)'
WHERE id = 'the-duplicate-strategy-id';
```

2. **Backup Recommended**: Before making schema changes, Supabase automatically keeps backups, but you can also export your data:

```sql
-- Export existing strategies (for backup)
SELECT * FROM strategies;
```

3. **No Downtime**: These changes can be run on a live database without downtime.

---

## 🎯 SUCCESS CRITERIA

After completing all changes:

✅ Can create strategies from the UI
✅ Cannot create strategies with duplicate names
✅ Can assign strategies to listings from dropdown
✅ Strategies display correctly in listings table
✅ Can edit strategies
✅ Can delete strategies (if not in use)

---

## 📞 SUPPORT

If you encounter any errors:

1. **Constraint Already Exists**: This is fine, skip that step
2. **Column Already Exists**: This is fine, skip that step
3. **Permission Denied**: Make sure you're running as database owner
4. **Duplicate Key Error**: You have duplicate strategy names, rename them first (see Important Notes #1)

---

## File References

- Migration file: `/Users/peternelson/ebay-price-reducer/add-unique-strategy-name-constraint.sql`
- Full schema: `/Users/peternelson/ebay-price-reducer/add-strategies-table.sql`
