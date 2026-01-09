/**
 * Category Mapper
 * 
 * Maps Amazon product data to eBay categories using the ebay_category_mappings table.
 * 
 * Lookup priority:
 * 1. Exact match on product_group + type (highest priority value wins)
 * 2. Match on product_group only
 * 3. Default fallback category
 */

/**
 * Get eBay category for an Amazon product
 * @param {Object} supabase - Supabase client
 * @param {Object} keepaProduct - Product data from Keepa
 * @returns {Object} - { categoryId, categoryName, requiredAspects, defaultCondition }
 */
async function getEbayCategory(supabase, keepaProduct) {
  const productGroup = keepaProduct.productGroup;
  const productType = keepaProduct.type;

  // Try exact match first (product_group + type)
  if (productGroup && productType) {
    const { data: exactMatch } = await supabase
      .from('ebay_category_mappings')
      .select('*')
      .eq('amazon_product_group', productGroup)
      .eq('amazon_type', productType)
      .order('priority', { ascending: false })
      .limit(1)
      .single();

    if (exactMatch) {
      return formatResult(exactMatch, 'exact');
    }
  }

  // Try product_group only
  if (productGroup) {
    const { data: groupMatch } = await supabase
      .from('ebay_category_mappings')
      .select('*')
      .eq('amazon_product_group', productGroup)
      .is('amazon_type', null)
      .order('priority', { ascending: false })
      .limit(1)
      .single();

    if (groupMatch) {
      return formatResult(groupMatch, 'group');
    }
  }

  // Default fallback
  const { data: defaultMatch } = await supabase
    .from('ebay_category_mappings')
    .select('*')
    .is('amazon_product_group', null)
    .is('amazon_type', null)
    .limit(1)
    .single();

  if (defaultMatch) {
    return formatResult(defaultMatch, 'default');
  }

  // Ultimate fallback if no default in DB
  return {
    categoryId: '99',
    categoryName: 'Everything Else',
    requiredAspects: {},
    defaultCondition: 'NEW',
    matchType: 'hardcoded'
  };
}

function formatResult(mapping, matchType) {
  return {
    categoryId: mapping.ebay_category_id,
    categoryName: mapping.ebay_category_name,
    requiredAspects: mapping.required_aspects || {},
    defaultCondition: mapping.default_condition || 'NEW',
    matchType: matchType
  };
}

/**
 * Get all category mappings (for admin/debugging)
 * @param {Object} supabase - Supabase client
 * @returns {Array} - All mappings
 */
async function getAllMappings(supabase) {
  const { data, error } = await supabase
    .from('ebay_category_mappings')
    .select('*')
    .order('amazon_product_group')
    .order('priority', { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch mappings: ${error.message}`);
  }

  return data;
}

/**
 * Add or update a category mapping
 * @param {Object} supabase - Supabase client
 * @param {Object} mapping - Mapping data
 * @returns {Object} - Created/updated mapping
 */
async function upsertMapping(supabase, mapping) {
  const { data, error } = await supabase
    .from('ebay_category_mappings')
    .upsert(mapping)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert mapping: ${error.message}`);
  }

  return data;
}

module.exports = {
  getEbayCategory,
  getAllMappings,
  upsertMapping
};
