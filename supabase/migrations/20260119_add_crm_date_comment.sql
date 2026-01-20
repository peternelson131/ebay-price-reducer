-- Add date and comment fields to sourced_products
ALTER TABLE sourced_products 
ADD COLUMN IF NOT EXISTS follow_up_date DATE,
ADD COLUMN IF NOT EXISTS follow_up_comment TEXT;

-- Add index for date queries
CREATE INDEX IF NOT EXISTS idx_sourced_products_follow_up_date ON sourced_products(follow_up_date);
