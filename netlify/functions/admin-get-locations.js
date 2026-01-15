/**
 * Admin Get Merchant Locations
 * Fetches eBay inventory locations for a specific user (admin only)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Admin user ID (Pete)
const ADMIN_USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get eBay access token for admin user
    const accessToken = await getValidAccessToken(supabase, ADMIN_USER_ID);

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
        total: locationResult.total || 0,
        raw: locationResult
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
