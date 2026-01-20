/**
 * Story 4A: Get eBay Category Suggestion
 * 
 * Calls eBay's getCategorySuggestions API with a product title
 * and returns the top suggested category.
 * 
 * Acceptance Criteria:
 * 1. Accepts a product title string
 * 2. Calls eBay Taxonomy API getCategorySuggestions with category_tree_id 0 (US)
 * 3. Returns the top suggested category ID and name
 * 4. Handles empty/no suggestions gracefully
 * 5. Uses eBay OAuth token (client credentials)
 * 6. Response time < 2 seconds
 */

// eBay API base URL - switch based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX ? 'https://api.sandbox.ebay.com' : 'https://api.ebay.com';

async function getEbayAccessToken() {
  // Get client credentials token for Taxonomy API (doesn't need user auth)
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

async function getCategorySuggestion(productTitle) {
  if (!productTitle || productTitle.trim() === '') {
    return { categoryId: null, categoryName: null, error: 'Empty product title' };
  }
  
  const accessToken = await getEbayAccessToken();
  
  // US category tree ID is 0
  const categoryTreeId = '0';
  const encodedQuery = encodeURIComponent(productTitle);
  
  const url = `${EBAY_API_BASE}/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_category_suggestions?q=${encodedQuery}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`eBay category suggestion failed: ${error}`);
  }
  
  const data = await response.json();
  
  // Return top suggestion (first in array = most relevant)
  if (data.categorySuggestions && data.categorySuggestions.length > 0) {
    const topSuggestion = data.categorySuggestions[0];
    return {
      categoryId: topSuggestion.category.categoryId,
      categoryName: topSuggestion.category.categoryName,
      ancestors: topSuggestion.categoryTreeNodeAncestors || [],
      allSuggestions: data.categorySuggestions.slice(0, 5) // Return top 5 for reference
    };
  }
  
  return { categoryId: null, categoryName: null, error: 'No suggestions returned' };
}

exports.handler = async (event, context) => {
  // CORS headers
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
    const { productTitle } = JSON.parse(event.body || '{}');
    
    if (!productTitle) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'productTitle is required' })
      };
    }
    
    const startTime = Date.now();
    const result = await getCategorySuggestion(productTitle);
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
    console.error('Error getting category suggestion:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Export for direct use in other functions
module.exports.getCategorySuggestion = getCategorySuggestion;
