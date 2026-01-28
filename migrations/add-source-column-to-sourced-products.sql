-- Migration: Add source column to sourced_products table
-- Purpose: Track where sourced_products records were created from
-- Author: Backend Agent
-- Date: 2026-01-28

-- Add source column to track import source
ALTER TABLE public.sourced_products 
ADD COLUMN IF NOT EXISTS source TEXT;

-- Add comment to document the column
COMMENT ON COLUMN public.sourced_products.source IS 'Source of the product record (e.g., catalog_import, manual, api)';

-- Create an index for faster filtering by source
CREATE INDEX IF NOT EXISTS idx_sourced_products_source 
ON public.sourced_products(source);
