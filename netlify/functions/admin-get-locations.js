/**
 * Admin Get Merchant Locations
 * Fetches eBay inventory locations for the authenticated user
 * 
 * SECURITY: Requires valid JWT Bearer token
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      console.log('Auth failed:', authResult.error);
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    console.log(`✅ Authenticated user: ${userId}`);

    // ─────────────────────────────────────────────────────────
    // Get eBay access token for authenticated user
    // ─────────────────────────────────────────────────────────
    const accessToken = await getValidAccessToken(supabase, userId);

    if (!accessToken) {
      return errorResponse(400, 'eBay not connected. Please connect your eBay account first.', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Fetch merchant locations from eBay
    // ─────────────────────────────────────────────────────────
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
    // Don't leak internal error details
    return errorResponse(500, 'Failed to fetch merchant locations', headers);
  }
};
