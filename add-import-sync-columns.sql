-- Migration: Add columns for eBay Import/Sync System
-- Run this in Supabase SQL Editor for UAT project (zzbzzpjqmbferplrwesn)

-- Add source column to track where listing came from
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) DEFAULT 'inventory_api';

-- Add ended_at column for tracking ended/sold listings
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMP WITH TIME ZONE;

-- Add quantity_sold column
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS quantity_sold INTEGER DEFAULT 0;

-- Add last_sync column (rename from last_n8n_sync concept)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS last_sync TIMESTAMP WITH TIME ZONE;

-- Add ebay_sku column if it doesn't exist (distinct from sku)
ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS ebay_sku VARCHAR(255);

-- Add indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_listings_source ON listings(source);
CREATE INDEX IF NOT EXISTS idx_listings_ended_at ON listings(ended_at);
CREATE INDEX IF NOT EXISTS idx_listings_last_sync ON listings(last_sync);
CREATE INDEX IF NOT EXISTS idx_listings_enable_auto_reduction ON listings(enable_auto_reduction);
CREATE INDEX IF NOT EXISTS idx_listings_listing_status ON listings(listing_status);

-- Add comment documentation
COMMENT ON COLUMN listings.source IS 'Source of listing: trading_api or inventory_api';
COMMENT ON COLUMN listings.ended_at IS 'When the listing ended or was sold';
COMMENT ON COLUMN listings.quantity_sold IS 'Number of items sold';
COMMENT ON COLUMN listings.last_sync IS 'Last time listing was synced from eBay';
COMMENT ON COLUMN listings.ebay_sku IS 'eBay SKU (may differ from internal sku)';

-- Verify the new columns exist
SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'listings'
  AND column_name IN ('source', 'ended_at', 'quantity_sold', 'last_sync', 'ebay_sku')
ORDER BY column_name;
