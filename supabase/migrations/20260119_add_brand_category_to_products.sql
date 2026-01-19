-- Add brand and category columns to sourced_products
-- These will be populated by Keepa enrichment

ALTER TABLE sourced_products
ADD COLUMN IF NOT EXISTS brand TEXT,
ADD COLUMN IF NOT EXISTS category TEXT;

-- Create index for potential filtering
CREATE INDEX IF NOT EXISTS idx_sourced_products_brand ON sourced_products(brand);
CREATE INDEX IF NOT EXISTS idx_sourced_products_category ON sourced_products(category);
