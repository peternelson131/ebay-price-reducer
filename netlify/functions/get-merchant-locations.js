/**
 * Get Merchant Locations
 * Fetches user's eBay inventory locations
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

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Get eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);

    // Fetch merchant locations
    const locationResult = await ebayApiRequest(
      accessToken,
      '/sell/inventory/v1/location',
      { method: 'GET' }
    );

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        locations: locationResult.locations || [],
        total: locationResult.total || 0
      })
    };

  } catch (error) {
    console.error('Error fetching locations:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
