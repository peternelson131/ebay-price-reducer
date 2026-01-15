-- Quick List Settings Table
-- Stores user-specific settings for the Quick List feature
-- Users must configure these before using Quick List

CREATE TABLE IF NOT EXISTS quick_list_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- eBay Business Policies (required)
  fulfillment_policy_id TEXT,
  payment_policy_id TEXT,
  return_policy_id TEXT,
  
  -- Merchant location (required)
  merchant_location_key TEXT,
  
  -- SKU settings
  sku_prefix TEXT DEFAULT 'ql_',
  
  -- Custom description note (optional - appended to all listings)
  description_note TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- One settings row per user
  CONSTRAINT quick_list_settings_user_unique UNIQUE (user_id)
);

-- Enable RLS
ALTER TABLE quick_list_settings ENABLE ROW LEVEL SECURITY;

-- Users can only see/edit their own settings
CREATE POLICY "Users can view own quick list settings"
  ON quick_list_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own quick list settings"
  ON quick_list_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quick list settings"
  ON quick_list_settings FOR UPDATE
  USING (auth.uid() = user_id);

-- Index for faster lookups
CREATE INDEX idx_quick_list_settings_user_id ON quick_list_settings(user_id);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_quick_list_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER quick_list_settings_updated_at
  BEFORE UPDATE ON quick_list_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_quick_list_settings_updated_at();
