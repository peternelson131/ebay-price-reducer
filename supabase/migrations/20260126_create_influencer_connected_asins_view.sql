-- Create unified view of all influencer-connected ASINs
-- Used by correlation finder to exclude ASINs user already has

CREATE OR REPLACE VIEW influencer_connected_asins AS

-- Source 1: CRM (sourced_products)
SELECT 
  sp.asin,
  'crm' AS source,
  sp.title,
  sp.image_url AS primary_keepa_image,
  sp.user_id,
  sp.created_at
FROM sourced_products sp

UNION ALL

-- Source 2: Catalog (catalog_imports)
SELECT 
  ci.asin,
  'catalog' AS source,
  ci.title,
  ci.image_url AS primary_keepa_image,
  ci.user_id,
  ci.created_at
FROM catalog_imports ci

UNION ALL

-- Source 3: Correlations (accepted only)
SELECT 
  ac.similar_asin AS asin,
  'correlation' AS source,
  ac.correlated_title AS title,
  ac.image_url AS primary_keepa_image,
  ac.user_id,
  ac.created_at
FROM asin_correlations ac
WHERE ac.decision = 'accepted'

UNION ALL

-- Source 4: Influencer Tasks (video uploads)
SELECT 
  it.asin,
  'task' AS source,
  it.title,
  NULL AS primary_keepa_image,
  it.user_id,
  it.created_at
FROM influencer_tasks it;

-- Note: RLS is not applied to views, security is enforced at query time via user_id filter
COMMENT ON VIEW influencer_connected_asins IS 'Unified view of all ASINs a user has influencer connection to (CRM, catalog, accepted correlations, tasks)';
