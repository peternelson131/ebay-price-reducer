/**
 * Story 4B: Get Required Aspects for Category
 * 
 * Calls eBay's getItemAspectsForCategory API with a category ID
 * and returns the required aspects with their valid values.
 * 
 * Acceptance Criteria:
 * 1. Accepts a category ID string
 * 2. Calls eBay Taxonomy API getItemAspectsForCategory
 * 3. Returns array of required aspects with their valid values
 * 4. Filters to only required aspects (not recommended/optional)
 * 5. Handles invalid category ID gracefully
 * 6. Response includes aspect name, data type, and allowed values
 */

// eBay API base URL - switch based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

async function getEbayAccessToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await fetch(`${EBAY_API_BASE}/identity/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get eBay access token: ${error}`);
  }
  
  const data = await response.json();
  return data.access_token;
}

async function getCategoryAspects(categoryId, requiredOnly = true) {
  if (!categoryId) {
    return { aspects: [], error: 'Category ID is required' };
  }
  
  const accessToken = await getEbayAccessToken();
  
  // US category tree ID is 0
  const categoryTreeId = '0';
  
  const url = `${EBAY_API_BASE}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?category_id=${categoryId}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 404 || response.status === 400) {
      return { aspects: [], error: 'Category not found or invalid', categoryId };
    }
    // For other errors, still return gracefully
    const errorText = await response.text();
    return { aspects: [], error: `eBay API error: ${response.status}`, categoryId };
  }
  
  const data = await response.json();
  
  if (!data.aspects || data.aspects.length === 0) {
    return { aspects: [], categoryId };
  }
  
  // Process aspects
  const aspects = data.aspects.map(aspect => ({
    name: aspect.localizedAspectName,
    required: aspect.aspectConstraint?.aspectRequired || false,
    dataType: aspect.aspectConstraint?.aspectDataType || 'STRING',
    mode: aspect.aspectConstraint?.aspectMode || 'FREE_TEXT',
    maxLength: aspect.aspectConstraint?.itemToAspectCardinality === 'MULTI' ? 'MULTI' : 'SINGLE',
    values: (aspect.aspectValues || []).map(v => v.localizedValue)
  }));
  
  // Filter to required only if requested
  const filteredAspects = requiredOnly 
    ? aspects.filter(a => a.required)
    : aspects;
  
  return {
    categoryId,
    aspects: filteredAspects,
    totalAspects: aspects.length,
    requiredCount: aspects.filter(a => a.required).length
  };
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }
  
  try {
    const { categoryId, requiredOnly = true } = JSON.parse(event.body || '{}');
    
    if (!categoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'categoryId is required' })
      };
    }
    
    const startTime = Date.now();
    const result = await getCategoryAspects(categoryId, requiredOnly);
    const elapsed = Date.now() - startTime;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ...result,
        responseTimeMs: elapsed
      })
    };
    
  } catch (error) {
    console.error('Error getting category aspects:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Export for direct use in other functions
module.exports.getCategoryAspects = getCategoryAspects;
