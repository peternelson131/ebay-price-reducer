/**
 * Deactivate Ended Listings
 * 
 * Task 6: Clean up ended/sold listings
 * - Find listings where quantity_available=0 or listing_status='Ended'
 * - Set ended_at = NOW()
 * - Optionally delete from eBay (Inventory API only)
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Environment detection
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

/**
 * Delete offer from eBay Inventory API
 */
async function deleteOffer(accessToken, offerId) {
  const url = `${EBAY_API_BASE}/sell/inventory/v1/offer/${offerId}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status === 204 || response.status === 200) {
    return { success: true };
  }
  
  if (response.status === 404) {
    // Already deleted
    return { success: true, alreadyDeleted: true };
  }
  
  const errorText = await response.text();
  throw new Error(`Failed to delete offer: ${response.status} - ${errorText}`);
}

/**
 * Delete inventory item from eBay Inventory API
 */
async function deleteInventoryItem(accessToken, sku) {
  const encodedSku = encodeURIComponent(sku);
  const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item/${encodedSku}`;
  
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (response.status === 204 || response.status === 200) {
    return { success: true };
  }
  
  if (response.status === 404) {
    // Already deleted
    return { success: true, alreadyDeleted: true };
  }
  
  const errorText = await response.text();
  throw new Error(`Failed to delete inventory item: ${response.status} - ${errorText}`);
}

/**
 * Check if listing should be deactivated
 */
function shouldDeactivate(listing) {
  // Already deactivated
  if (listing.ended_at) {
    return false;
  }
  
  // Check quantity
  if (listing.quantity_available === 0) {
    return true;
  }
  
  // Check status
  if (listing.listing_status === 'Ended' || listing.listing_status === 'Completed') {
    return true;
  }
  
  return false;
}

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
    console.log('🗑️ deactivate-ended-listings started');
    console.log(`Environment: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'}`);

    // Authenticate user
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

    // Parse options
    const options = event.body ? JSON.parse(event.body) : {};
    const deleteFromEbay = options.deleteFromEbay || false; // Default: don't delete from eBay

    // Find listings that need to be deactivated
    const { data: listings, error: fetchError } = await supabase
      .from('listings')
      .select('*')
      .eq('user_id', user.id)
      .is('ended_at', null)
      .or('quantity_available.eq.0,listing_status.eq.Ended,listing_status.eq.Completed');

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    console.log(`📊 Found ${listings?.length || 0} listings to check`);

    // Filter to listings that should actually be deactivated
    const toDeactivate = (listings || []).filter(shouldDeactivate);
    console.log(`📊 ${toDeactivate.length} listings to deactivate`);

    const results = {
      deactivated: 0,
      deletedFromEbay: 0,
      errors: []
    };

    // Get access token if we need to delete from eBay
    let accessToken = null;
    if (deleteFromEbay && toDeactivate.some(l => l.source === 'inventory_api')) {
      accessToken = await getValidAccessToken(supabase, user.id);
    }

    // Process each listing
    for (const listing of toDeactivate) {
      try {
        // Optionally delete from eBay (Inventory API only)
        if (deleteFromEbay && listing.source === 'inventory_api' && accessToken) {
          try {
            // Delete offer first (if we have offerId)
            if (listing.offer_id) {
              await deleteOffer(accessToken, listing.offer_id);
            }
            
            // Delete inventory item
            if (listing.ebay_sku) {
              await deleteInventoryItem(accessToken, listing.ebay_sku);
            }
            
            results.deletedFromEbay++;
            console.log(`🗑️ Deleted from eBay: ${listing.ebay_sku || listing.id}`);
          } catch (ebayError) {
            console.warn(`Warning: Failed to delete from eBay: ${ebayError.message}`);
            // Continue to deactivate in DB anyway
          }
        }

        // Mark as ended in database
        const { error: updateError } = await supabase
          .from('listings')
          .update({
            listing_status: 'Ended',
            ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', listing.id);

        if (updateError) {
          throw updateError;
        }

        results.deactivated++;
        console.log(`✅ Deactivated: ${listing.title?.substring(0, 30) || listing.id}`);

      } catch (listingError) {
        console.error(`Error deactivating listing ${listing.id}:`, listingError);
        results.errors.push({
          listingId: listing.id,
          error: listingError.message
        });
      }
    }

    console.log('✅ Deactivation complete:', results);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        stats: {
          checked: listings?.length || 0,
          deactivated: results.deactivated,
          deletedFromEbay: results.deletedFromEbay,
          errors: results.errors.length
        },
        errors: results.errors.length > 0 ? results.errors : undefined
      })
    };

  } catch (error) {
    console.error('❌ deactivate-ended-listings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to deactivate ended listings',
        message: error.message
      })
    };
  }
};
