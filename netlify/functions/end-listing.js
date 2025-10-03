const { supabase } = require('./utils/supabase');
const { EbayApiClient } = require('./utils/ebay-api-client');

/**
 * End a listing on eBay
 * This closes the listing on eBay and updates the database status to 'Ended'
 *
 * @param {Object} event - Netlify function event
 * @returns {Object} Response with status and message
 */
exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get user from authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing or invalid authorization header' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid or expired token' })
      };
    }

    // Parse request body
    const { listingId } = JSON.parse(event.body || '{}');

    if (!listingId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing listingId in request body' })
      };
    }

    // Get listing from database
    const { data: listing, error: fetchError } = await supabase
      .from('listings')
      .select('id, ebay_item_id, title, quantity')
      .eq('id', listingId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !listing) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Listing not found or does not belong to user' })
      };
    }

    // Verify quantity is 0 (only end listings with quantity=0)
    if (listing.quantity !== 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Can only end listings with quantity = 0. Current quantity: ' + listing.quantity
        })
      };
    }

    // Initialize eBay API client
    const ebayClient = new EbayApiClient(user.id);
    await ebayClient.initialize();

    // End the listing on eBay
    try {
      const endResponse = await ebayClient.endListing(listing.ebay_item_id, 'NotAvailable');

      console.log(`Successfully ended listing ${listing.ebay_item_id} on eBay:`, endResponse);

      // Update database to mark listing as Ended
      const { error: updateError } = await supabase
        .from('listings')
        .update({
          listing_status: 'Ended',
          updated_at: new Date().toISOString()
        })
        .eq('id', listingId)
        .eq('user_id', user.id);

      if (updateError) {
        console.error('Failed to update listing status in database:', updateError);
        // Don't fail the request - listing was ended on eBay successfully
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'Listing ended successfully on eBay',
          listing: {
            id: listing.id,
            title: listing.title,
            ebay_item_id: listing.ebay_item_id
          }
        })
      };

    } catch (ebayError) {
      console.error('eBay API error when ending listing:', ebayError);

      // Check if listing is already ended
      if (ebayError.message && ebayError.message.includes('already ended')) {
        // Update database anyway
        await supabase
          .from('listings')
          .update({
            listing_status: 'Ended',
            updated_at: new Date().toISOString()
          })
          .eq('id', listingId)
          .eq('user_id', user.id);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            message: 'Listing was already ended on eBay',
            listing: {
              id: listing.id,
              title: listing.title,
              ebay_item_id: listing.ebay_item_id
            }
          })
        };
      }

      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Failed to end listing on eBay: ' + ebayError.message
        })
      };
    }

  } catch (error) {
    console.error('Unexpected error in end-listing function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error: ' + error.message })
    };
  }
};
