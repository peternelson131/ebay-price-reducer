const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get allowed item conditions for a specific eBay category
 *
 * Request body:
 * {
 *   "categoryId": "12345"
 * }
 *
 * Response:
 * {
 *   "categoryId": "12345",
 *   "categoryName": "Men's Clothing",
 *   "allowedConditions": [
 *     { "conditionId": "1000", "conditionDescription": "New" },
 *     { "conditionId": "1500", "conditionDescription": "New with tags" }
 *   ],
 *   "conditionRequired": true,
 *   "fromCache": true
 * }
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

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
    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // 2. Parse request
    const { categoryId } = JSON.parse(event.body);

    if (!categoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'categoryId is required' })
      };
    }

    console.log(`📋 Fetching conditions for category: ${categoryId}`);

    // 3. Initialize eBay client and get category aspects (which includes conditions)
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    const result = await ebayClient.getCachedCategoryAspects(categoryId);

    // 4. Return conditions data
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        categoryId: categoryId,
        categoryName: result.categoryName || '',
        allowedConditions: result.allowedConditions || [],
        conditionRequired: result.conditionRequired || false,
        fromCache: result.fromCache
      })
    };

  } catch (error) {
    console.error('❌ Get category conditions error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch category conditions',
        message: error.message
      })
    };
  }
};
