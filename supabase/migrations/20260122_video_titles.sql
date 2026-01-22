-- Add title prefix to owners
ALTER TABLE crm_owners 
ADD COLUMN IF NOT EXISTS title_prefix TEXT DEFAULT 'Honest Review';

-- Add video title to products
ALTER TABLE crm_products 
ADD COLUMN IF NOT EXISTS video_title TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_crm_products_video_title ON crm_products(video_title);
