-- Add AfterShip tracking fields to sourced_products
ALTER TABLE sourced_products
ADD COLUMN IF NOT EXISTS aftership_tracking_id text,
ADD COLUMN IF NOT EXISTS tracking_status text,
ADD COLUMN IF NOT EXISTS tracking_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS carrier text,
ADD COLUMN IF NOT EXISTS delivery_date date;

-- Create index for faster lookups by tracking number
CREATE INDEX IF NOT EXISTS idx_sourced_products_tracking_number 
ON sourced_products(tracking_number) 
WHERE tracking_number IS NOT NULL;

-- Create index for tracking status
CREATE INDEX IF NOT EXISTS idx_sourced_products_tracking_status
ON sourced_products(tracking_status)
WHERE tracking_status IS NOT NULL;

-- Add "In Transit" status if it doesn't exist for all users
INSERT INTO crm_statuses (name, color, user_id, sort_order)
SELECT 'In Transit', '#F59E0B', id, 6
FROM users
WHERE NOT EXISTS (
  SELECT 1 FROM crm_statuses 
  WHERE name = 'In Transit' 
  AND user_id = users.id
);

-- Comment on new columns
COMMENT ON COLUMN sourced_products.aftership_tracking_id IS 'AfterShip tracking ID for webhook updates';
COMMENT ON COLUMN sourced_products.tracking_status IS 'Current tracking status from AfterShip';
COMMENT ON COLUMN sourced_products.tracking_updated_at IS 'Last time tracking status was updated';
COMMENT ON COLUMN sourced_products.carrier IS 'Shipping carrier slug from AfterShip';
COMMENT ON COLUMN sourced_products.delivery_date IS 'Expected or actual delivery date';