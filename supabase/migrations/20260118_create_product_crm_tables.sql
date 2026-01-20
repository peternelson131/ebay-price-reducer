-- =============================================
-- Product Sourcing CRM Tables
-- Migration: 20260118_create_product_crm_tables
-- =============================================

-- 1. CRM Statuses (user-customizable)
CREATE TABLE IF NOT EXISTS crm_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL for system defaults
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  auto_set_on_delivery BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 2. CRM Collaboration Types (user-customizable)
CREATE TABLE IF NOT EXISTS crm_collaboration_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 3. CRM Contact Sources (user-customizable)
CREATE TABLE IF NOT EXISTS crm_contact_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 4. CRM Marketplaces (user-customizable)
CREATE TABLE IF NOT EXISTS crm_marketplaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  has_quick_list BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, name)
);

-- 5. Sourced Products (main table)
CREATE TABLE IF NOT EXISTS sourced_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  
  -- Product info
  asin TEXT NOT NULL,
  title TEXT,
  image_url TEXT,
  amazon_url TEXT GENERATED ALWAYS AS ('https://amazon.com/dp/' || asin) STORED,
  keepa_graph_url TEXT,
  
  -- Classification
  status_id UUID REFERENCES crm_statuses(id) ON DELETE SET NULL,
  decision TEXT CHECK (decision IN ('sell', 'keep', NULL)),
  collaboration_type_id UUID REFERENCES crm_collaboration_types(id) ON DELETE SET NULL,
  contact_source_id UUID REFERENCES crm_contact_sources(id) ON DELETE SET NULL,
  requirements TEXT,
  commitment_date DATE,
  
  -- Marketplace (for sell decision) - stores marketplace IDs as array
  target_marketplace_ids UUID[] DEFAULT '{}',
  ebay_listing_id UUID,  -- Link to created eBay listing
  
  -- Shipping
  tracking_number TEXT,
  carrier TEXT CHECK (carrier IN ('usps', 'ups', 'fedex', 'amazon', 'dhl', 'ontrac', 'other', NULL)),
  shipping_status TEXT DEFAULT 'pending' CHECK (shipping_status IN (
    'pending', 'label_created', 'picked_up', 'in_transit', 
    'out_for_delivery', 'delivered', 'exception', 'returned', NULL
  )),
  shipping_eta DATE,
  shipping_events JSONB DEFAULT '[]',
  shipping_last_checked TIMESTAMPTZ,
  aftership_tracking_id TEXT,  -- AfterShip tracking ID for reference
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Product Owners (many-to-many junction table)
CREATE TABLE IF NOT EXISTS product_owners (
  product_id UUID REFERENCES sourced_products(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (product_id, owner_id)
);

-- =============================================
-- Indexes for Performance
-- =============================================

CREATE INDEX IF NOT EXISTS idx_sourced_products_user_id ON sourced_products(user_id);
CREATE INDEX IF NOT EXISTS idx_sourced_products_asin ON sourced_products(asin);
CREATE INDEX IF NOT EXISTS idx_sourced_products_status_id ON sourced_products(status_id);
CREATE INDEX IF NOT EXISTS idx_sourced_products_tracking ON sourced_products(tracking_number);
CREATE INDEX IF NOT EXISTS idx_product_owners_owner_id ON product_owners(owner_id);

-- =============================================
-- Row Level Security Policies
-- =============================================

-- Enable RLS on all tables
ALTER TABLE crm_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_collaboration_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_marketplaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourced_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_owners ENABLE ROW LEVEL SECURITY;

-- CRM Statuses: See system defaults (user_id IS NULL) + own custom statuses
CREATE POLICY "Users can view system and own statuses" ON crm_statuses
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert own statuses" ON crm_statuses
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own statuses" ON crm_statuses
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own statuses" ON crm_statuses
  FOR DELETE USING (user_id = auth.uid());

-- CRM Collaboration Types: Same pattern
CREATE POLICY "Users can view system and own collaboration types" ON crm_collaboration_types
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert own collaboration types" ON crm_collaboration_types
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own collaboration types" ON crm_collaboration_types
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own collaboration types" ON crm_collaboration_types
  FOR DELETE USING (user_id = auth.uid());

-- CRM Contact Sources: Same pattern
CREATE POLICY "Users can view system and own contact sources" ON crm_contact_sources
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert own contact sources" ON crm_contact_sources
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own contact sources" ON crm_contact_sources
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own contact sources" ON crm_contact_sources
  FOR DELETE USING (user_id = auth.uid());

-- CRM Marketplaces: Same pattern
CREATE POLICY "Users can view system and own marketplaces" ON crm_marketplaces
  FOR SELECT USING (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "Users can insert own marketplaces" ON crm_marketplaces
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own marketplaces" ON crm_marketplaces
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can delete own marketplaces" ON crm_marketplaces
  FOR DELETE USING (user_id = auth.uid());

-- Sourced Products: Can see own products OR products where user is an owner
CREATE POLICY "Users can view own or shared products" ON sourced_products
  FOR SELECT USING (
    user_id = auth.uid() OR 
    id IN (SELECT product_id FROM product_owners WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can insert own products" ON sourced_products
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own or shared products" ON sourced_products
  FOR UPDATE USING (
    user_id = auth.uid() OR 
    id IN (SELECT product_id FROM product_owners WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can delete own products" ON sourced_products
  FOR DELETE USING (user_id = auth.uid());

-- Product Owners: Can see/manage owners for products user has access to
CREATE POLICY "Users can view owners of accessible products" ON product_owners
  FOR SELECT USING (
    product_id IN (
      SELECT id FROM sourced_products WHERE user_id = auth.uid()
      UNION
      SELECT product_id FROM product_owners WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Product creator can add owners" ON product_owners
  FOR INSERT WITH CHECK (
    product_id IN (SELECT id FROM sourced_products WHERE user_id = auth.uid())
  );

CREATE POLICY "Product creator can remove owners" ON product_owners
  FOR DELETE USING (
    product_id IN (SELECT id FROM sourced_products WHERE user_id = auth.uid())
  );

-- =============================================
-- Seed Data: System Defaults
-- =============================================

-- Default Statuses
INSERT INTO crm_statuses (user_id, name, color, sort_order, auto_set_on_delivery) VALUES
  (NULL, 'Sourcing', '#3B82F6', 1, false),
  (NULL, 'Review', '#8B5CF6', 2, false),
  (NULL, 'Negotiating', '#F97316', 3, false),
  (NULL, 'Committed', '#06B6D4', 4, false),
  (NULL, 'Ordered', '#6366F1', 5, false),
  (NULL, 'Shipped', '#EAB308', 6, false),
  (NULL, 'In Transit', '#FBBF24', 7, false),
  (NULL, 'Delivered', '#10B981', 8, true),
  (NULL, 'To Receive', '#F97316', 9, false),
  (NULL, 'Completed', '#22C55E', 10, false),
  (NULL, 'Returned', '#EF4444', 11, false),
  (NULL, 'Cancelled', '#9CA3AF', 12, false),
  (NULL, 'Problem', '#DC2626', 13, false)
ON CONFLICT (user_id, name) DO NOTHING;

-- Default Collaboration Types
INSERT INTO crm_collaboration_types (user_id, name) VALUES
  (NULL, 'Brand Deal'),
  (NULL, 'Personal Purchase')
ON CONFLICT (user_id, name) DO NOTHING;

-- Default Contact Sources
INSERT INTO crm_contact_sources (user_id, name) VALUES
  (NULL, 'Facebook Group'),
  (NULL, 'Instagram'),
  (NULL, 'Direct Contact'),
  (NULL, 'Trade Show'),
  (NULL, 'Referral')
ON CONFLICT (user_id, name) DO NOTHING;

-- Default Marketplaces
INSERT INTO crm_marketplaces (user_id, name, has_quick_list) VALUES
  (NULL, 'eBay', true),
  (NULL, 'Facebook Marketplace', false),
  (NULL, 'Amazon', false),
  (NULL, 'Keep', false)
ON CONFLICT (user_id, name) DO NOTHING;

-- =============================================
-- Updated_at Trigger
-- =============================================

CREATE OR REPLACE FUNCTION update_sourced_products_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sourced_products_updated_at
  BEFORE UPDATE ON sourced_products
  FOR EACH ROW
  EXECUTE FUNCTION update_sourced_products_updated_at();

-- =============================================
-- Rollback Script (save separately or comment out)
-- =============================================
-- DROP TRIGGER IF EXISTS sourced_products_updated_at ON sourced_products;
-- DROP FUNCTION IF EXISTS update_sourced_products_updated_at();
-- DROP TABLE IF EXISTS product_owners;
-- DROP TABLE IF EXISTS sourced_products;
-- DROP TABLE IF EXISTS crm_marketplaces;
-- DROP TABLE IF EXISTS crm_contact_sources;
-- DROP TABLE IF EXISTS crm_collaboration_types;
-- DROP TABLE IF EXISTS crm_statuses;
