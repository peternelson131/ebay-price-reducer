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
    let missingAspects = [];

    if (error.message.includes('eBay API error')) {
      // Parse missing item specific errors like:
      // "The item specific Material is missing. Add Material to this listing..."
      const missingAspectMatch = error.message.match(/item specific (\w+) is missing/gi);
      if (missingAspectMatch) {
        missingAspects = missingAspectMatch.map(m => {
          const match = m.match(/item specific (\w+) is missing/i);
          return match ? match[1] : null;
        }).filter(Boolean);
        
        console.log(`📋 Missing aspects detected: ${missingAspects.join(', ')}`);
        errorDetails = `Missing required aspects: ${missingAspects.join(', ')}. The system is learning these patterns.`;
      }
      
      // Common publish errors
      if (error.message.includes('INVALID_VALUE') && !missingAspects.length) {
        errorDetails = 'Some required fields are missing or invalid. Check item specifics for the category.';
      } else if (error.message.includes('LISTING_VALIDATION')) {
        errorDetails = 'Listing failed validation. Check title, description, and category requirements.';
      } else if (error.message.includes('DUPLICATE')) {
        errorDetails = 'A similar listing already exists. Check your active listings.';
      }
    }

    // If we detected missing aspects, log them for AI learning
    if (missingAspects.length > 0) {
      try {
        // Get offer details to find the SKU/ASIN and category
        const { offerId } = JSON.parse(event.body);
        
        // Try to get offer details from our database or eBay
        // For now, we'll insert a placeholder that can be enriched later
        for (const aspectName of missingAspects) {
          await supabase
            .from('ebay_aspect_misses')
            .insert({
              asin: `OFFER_${offerId}`, // Will be enriched when we have the ASIN
              aspect_name: aspectName,
              product_title: 'Unknown - from publish error',
              category_id: null,
              category_name: null,
              status: 'pending',
              notes: `Detected from publish error for offer ${offerId}`
            })
            .then(({ error }) => {
              if (error) {
                console.log(`⚠️ Failed to log aspect miss: ${error.message}`);
              } else {
                console.log(`📝 Logged missing aspect "${aspectName}" for AI learning`);
              }
            });
        }
      } catch (logError) {
        console.error('Failed to log missing aspects:', logError);
        // Don't fail the response because of logging
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to publish offer',
        message: errorMessage,
        details: errorDetails,
        missingAspects: missingAspects.length > 0 ? missingAspects : undefined
      })
    };
  }
};
