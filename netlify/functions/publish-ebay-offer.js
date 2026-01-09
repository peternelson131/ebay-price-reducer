/**
 * Publish eBay Offer
 * 
 * Story 3: Publish an offer to make it a live listing
 * 
 * Flow:
 * 1. Authenticate user
 * 2. Call eBay API to publish the offer
 * 3. Return listing ID and URL
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🚀 publish-ebay-offer called');

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

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse request
    const { offerId } = JSON.parse(event.body);

    if (!offerId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Offer ID is required' })
      };
    }

    console.log(`📝 Publishing offer: ${offerId}`);

    // 3. Get valid eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Publish the offer
    const result = await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/offer/${offerId}/publish`,
      { method: 'POST' }
    );

    console.log('✅ Offer published successfully');
    console.log(`   Listing ID: ${result.listingId}`);

    // Generate listing URL
    const listingUrl = `https://www.ebay.com/itm/${result.listingId}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        listingId: result.listingId,
        offerId: offerId,
        listingUrl: listingUrl,
        message: 'Listing is now live on eBay!'
      })
    };

  } catch (error) {
    console.error('❌ Error publishing offer:', error);

    // Parse eBay API errors for better messages
    let errorMessage = error.message;
    let errorDetails = null;

    if (error.message.includes('eBay API error')) {
      // Common publish errors
      if (error.message.includes('INVALID_VALUE')) {
        errorDetails = 'Some required fields are missing or invalid. Check item specifics for the category.';
      } else if (error.message.includes('LISTING_VALIDATION')) {
        errorDetails = 'Listing failed validation. Check title, description, and category requirements.';
      } else if (error.message.includes('DUPLICATE')) {
        errorDetails = 'A similar listing already exists. Check your active listings.';
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to publish offer',
        message: errorMessage,
        details: errorDetails
      })
    };
  }
};
