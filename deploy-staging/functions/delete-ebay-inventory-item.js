/**
 * Delete eBay Inventory Item
 * 
 * Used for cleanup after testing
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'DELETE' && event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🗑️ delete-ebay-inventory-item called');

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
    const { sku } = JSON.parse(event.body);

    if (!sku) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'SKU is required' })
      };
    }

    console.log(`🗑️ Deleting inventory item: ${sku}`);

    // 3. Get eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Delete inventory item
    await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'DELETE' }
    );

    console.log(`✅ Deleted inventory item: ${sku}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Inventory item ${sku} deleted successfully`
      })
    };

  } catch (error) {
    console.error('❌ Error deleting inventory item:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to delete inventory item',
        message: error.message
      })
    };
  }
};
