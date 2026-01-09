/**
 * Delete eBay Offer
 * 
 * Used for cleanup after testing or to remove unpublished offers
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
    console.log('🗑️ delete-ebay-offer called');

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
    const { offerId } = JSON.parse(event.body);

    if (!offerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Offer ID is required' })
      };
    }

    console.log(`🗑️ Deleting offer: ${offerId}`);

    // 3. Get eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Delete offer
    await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/offer/${offerId}`,
      { method: 'DELETE' }
    );

    console.log(`✅ Deleted offer: ${offerId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Offer ${offerId} deleted successfully`
      })
    };

  } catch (error) {
    console.error('❌ Error deleting offer:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to delete offer',
        message: error.message
      })
    };
  }
};
