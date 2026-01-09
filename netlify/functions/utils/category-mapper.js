/**
 * Category Mapper v2
 * 
 * Maps Amazon product data to eBay LEAF categories with required aspects.
 * 
 * Uses two tables:
 * - ebay_category_mappings: Amazon → eBay category lookup
 * - ebay_category_requirements: Leaf validation + required aspects
 */

/**
 * Get eBay category for an Amazon product
 * @param {Object} supabase - Supabase client
 * @param {Object} keepaProduct - Product data from Keepa
 * @returns {Object} - { categoryId, categoryName, isLeaf, requiredAspects, matchType }
 */
async function getEbayCategory(supabase, keepaProduct) {
  const productGroup = keepaProduct.productGroup;
  const productType = keepaProduct.type;

  // Step 1: Find category mapping
  let mapping = null;
  let matchType = 'default';

  // Try exact match (product_group + type)
  if (productGroup && productType) {
    const { data } = await supabase
      .from('ebay_category_mappings')
      .select('*')
      .eq('amazon_product_group', productGroup)
      .eq('amazon_type', productType)
      .order('priority', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      mapping = data;
      matchType = 'exact';
    }
  }

  // Try product_group only
  if (!mapping && productGroup) {
    const { data } = await supabase
      .from('ebay_category_mappings')
      .select('*')
      .eq('amazon_product_group', productGroup)
      .is('amazon_type', null)
      .order('priority', { ascending: false })
      .limit(1)
      .single();
    
    if (data) {
      mapping = data;
      matchType = 'group';
    }
  }

  // Default fallback
  if (!mapping) {
    const { data } = await supabase
      .from('ebay_category_mappings')
      .select('*')
      .is('amazon_product_group', null)
      .is('amazon_type', null)
      .limit(1)
      .single();
    
    mapping = data;
    matchType = 'default';
  }

  const categoryId = mapping?.ebay_category_id || '99';
  const categoryName = mapping?.ebay_category_name || 'Everything Else';

  // Step 2: Get category requirements (check if leaf, get required aspects)
  const { data: requirements } = await supabase
    .from('ebay_category_requirements')
    .select('*')
    .eq('ebay_category_id', categoryId)
    .single();

  // If category is not a leaf, try to find a leaf subcategory
  if (requirements && !requirements.is_leaf) {
    // Look for a leaf category with this as parent
    const { data: leafCategory } = await supabase
      .from('ebay_category_requirements')
      .select('*')
      .eq('parent_category_id', categoryId)
      .eq('is_leaf', true)
      .limit(1)
      .single();

    if (leafCategory) {
      return {
        categoryId: leafCategory.ebay_category_id,
        categoryName: leafCategory.ebay_category_name,
        isLeaf: true,
        requiredAspects: leafCategory.required_aspects || [],
        optionalAspects: leafCategory.optional_aspects || [],
        matchType: matchType + '+leaf',
        originalCategoryId: categoryId,
        notes: leafCategory.notes
      };
    }
  }

  return {
    categoryId,
    categoryName,
    isLeaf: requirements?.is_leaf ?? true,
    requiredAspects: requirements?.required_aspects || [],
    optionalAspects: requirements?.optional_aspects || [],
    matchType,
    notes: requirements?.notes
  };
}

/**
 * Get category requirements by ID
 */
async function getCategoryRequirements(supabase, categoryId) {
  const { data, error } = await supabase
    .from('ebay_category_requirements')
    .select('*')
    .eq('ebay_category_id', categoryId)
    .single();

  if (error || !data) {
    return null;
  }

  return data;
}

/**
 * Get all leaf categories
 */
async function getLeafCategories(supabase) {
  const { data } = await supabase
    .from('ebay_category_requirements')
    .select('*')
    .eq('is_leaf', true)
    .order('ebay_category_name');

  return data || [];
}

/**
 * Add or update a category requirement
 */
async function upsertCategoryRequirement(supabase, requirement) {
  requirement.updated_at = new Date().toISOString();
  
  const { data, error } = await supabase
    .from('ebay_category_requirements')
    .upsert(requirement, { onConflict: 'ebay_category_id' })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to upsert requirement: ${error.message}`);
  }

  return data;
}

module.exports = {
  getEbayCategory,
  getCategoryRequirements,
  getLeafCategories,
  upsertCategoryRequirement
};
