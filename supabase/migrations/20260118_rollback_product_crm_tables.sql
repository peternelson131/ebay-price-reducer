-- =============================================
-- Product Sourcing CRM Tables - ROLLBACK
-- Migration: 20260118_rollback_product_crm_tables
-- 
-- WARNING: This will DELETE all CRM data!
-- Only run if you need to completely remove the feature.
-- =============================================

-- Drop trigger first
DROP TRIGGER IF EXISTS sourced_products_updated_at ON sourced_products;
DROP FUNCTION IF EXISTS update_sourced_products_updated_at();

-- Drop policies on product_owners
DROP POLICY IF EXISTS "Users can view owners of accessible products" ON product_owners;
DROP POLICY IF EXISTS "Product creator can add owners" ON product_owners;
DROP POLICY IF EXISTS "Product creator can remove owners" ON product_owners;

-- Drop policies on sourced_products
DROP POLICY IF EXISTS "Users can view own or shared products" ON sourced_products;
DROP POLICY IF EXISTS "Users can insert own products" ON sourced_products;
DROP POLICY IF EXISTS "Users can update own or shared products" ON sourced_products;
DROP POLICY IF EXISTS "Users can delete own products" ON sourced_products;

-- Drop policies on lookup tables
DROP POLICY IF EXISTS "Users can view system and own statuses" ON crm_statuses;
DROP POLICY IF EXISTS "Users can insert own statuses" ON crm_statuses;
DROP POLICY IF EXISTS "Users can update own statuses" ON crm_statuses;
DROP POLICY IF EXISTS "Users can delete own statuses" ON crm_statuses;

DROP POLICY IF EXISTS "Users can view system and own collaboration types" ON crm_collaboration_types;
DROP POLICY IF EXISTS "Users can insert own collaboration types" ON crm_collaboration_types;
DROP POLICY IF EXISTS "Users can update own collaboration types" ON crm_collaboration_types;
DROP POLICY IF EXISTS "Users can delete own collaboration types" ON crm_collaboration_types;

DROP POLICY IF EXISTS "Users can view system and own contact sources" ON crm_contact_sources;
DROP POLICY IF EXISTS "Users can insert own contact sources" ON crm_contact_sources;
DROP POLICY IF EXISTS "Users can update own contact sources" ON crm_contact_sources;
DROP POLICY IF EXISTS "Users can delete own contact sources" ON crm_contact_sources;

DROP POLICY IF EXISTS "Users can view system and own marketplaces" ON crm_marketplaces;
DROP POLICY IF EXISTS "Users can insert own marketplaces" ON crm_marketplaces;
DROP POLICY IF EXISTS "Users can update own marketplaces" ON crm_marketplaces;
DROP POLICY IF EXISTS "Users can delete own marketplaces" ON crm_marketplaces;

-- Drop tables in dependency order
DROP TABLE IF EXISTS product_owners;
DROP TABLE IF EXISTS sourced_products;
DROP TABLE IF EXISTS crm_marketplaces;
DROP TABLE IF EXISTS crm_contact_sources;
DROP TABLE IF EXISTS crm_collaboration_types;
DROP TABLE IF EXISTS crm_statuses;

-- Confirmation
DO $$
BEGIN
  RAISE NOTICE 'Product CRM tables rolled back successfully.';
END $$;
