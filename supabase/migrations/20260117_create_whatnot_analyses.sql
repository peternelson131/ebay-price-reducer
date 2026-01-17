-- WhatNot Liquidation Manifest Analysis Table
-- Created: 2026-01-17
-- Purpose: Store and analyze liquidation manifest data from WhatNot

CREATE TABLE IF NOT EXISTS whatnot_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asin TEXT NOT NULL,
  title TEXT,
  quantity INTEGER DEFAULT 1,
  manifest_price DECIMAL(10,2),
  
  -- Keepa enriched data
  amazon_price DECIMAL(10,2),
  sales_rank INTEGER,
  sales_rank_90_avg INTEGER,
  buy_box_price DECIMAL(10,2),
  fba_sellers INTEGER,
  fbm_sellers INTEGER,
  category TEXT,
  image_url TEXT,
  
  -- Calculated fields
  estimated_profit DECIMAL(10,2),
  roi_percent DECIMAL(5,2),
  
  -- Metadata from manifest
  lot_id TEXT,
  condition TEXT,
  brand TEXT,
  upc TEXT,
  ext_retail DECIMAL(10,2),
  
  -- Analysis status
  status TEXT DEFAULT 'imported' CHECK (status IN ('imported', 'enriching', 'enriched', 'error')),
  error_message TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, asin, lot_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_whatnot_analyses_user_id ON whatnot_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_whatnot_analyses_asin ON whatnot_analyses(asin);
CREATE INDEX IF NOT EXISTS idx_whatnot_analyses_lot_id ON whatnot_analyses(lot_id);
CREATE INDEX IF NOT EXISTS idx_whatnot_analyses_status ON whatnot_analyses(status);
CREATE INDEX IF NOT EXISTS idx_whatnot_analyses_roi ON whatnot_analyses(roi_percent DESC NULLS LAST);

-- Enable RLS
ALTER TABLE whatnot_analyses ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own analyses"
  ON whatnot_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses"
  ON whatnot_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses"
  ON whatnot_analyses FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own analyses"
  ON whatnot_analyses FOR DELETE
  USING (auth.uid() = user_id);

-- Updated at trigger
CREATE OR REPLACE FUNCTION update_whatnot_analyses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_whatnot_analyses_updated_at
  BEFORE UPDATE ON whatnot_analyses
  FOR EACH ROW
  EXECUTE FUNCTION update_whatnot_analyses_updated_at();
