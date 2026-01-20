-- Fix: Remove recursive RLS policy on product_owners

-- Drop the problematic policy
DROP POLICY IF EXISTS "Users can view owners of accessible products" ON product_owners;

-- Create fixed policy: Can view if you're an owner OR you created the product
CREATE POLICY "Users can view owners of accessible products" ON product_owners
  FOR SELECT USING (
    owner_id = auth.uid() OR
    product_id IN (SELECT id FROM sourced_products WHERE user_id = auth.uid())
  );
