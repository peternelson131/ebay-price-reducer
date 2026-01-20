/**
 * Sync Inventory API Listings
 * 
 * Task 2: Import listings via eBay Inventory API (REST)
 * - GET /sell/inventory/v1/inventory_item?limit=200
 * - Insert new SKUs to database
 * - For each SKU, GET /sell/inventory/v1/offer?sku={sku} to get price/listingId
 * - Update DB with offer details
 * - Set source='inventory_api'
 * - Handle pagination
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Environment detection
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_API_BASE = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

const ITEMS_PER_PAGE = 200;

/**
 * Fetch inventory items with pagination
 */
async function fetchInventoryItems(accessToken) {
  const allItems = [];
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const url = `${EBAY_API_BASE}/sell/inventory/v1/inventory_item?limit=${ITEMS_PER_PAGE}&offset=${offset}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 404) {
      // No inventory items
      console.log('No inventory items found');
      break;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Inventory API error:', response.status, errorText);
      throw new Error(`Inventory API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.inventoryItems && data.inventoryItems.length > 0) {
      allItems.push(...data.inventoryItems);
      console.log(`Fetched ${data.inventoryItems.length} inventory items (offset: ${offset})`);
    }
    
    // Check for more pages
    if (data.next) {
      offset += ITEMS_PER_PAGE;
    } else {
      hasMore = false;
    }
  }
  
  return allItems;
}

/**
 * Fetch offer details for a SKU
 */
async function fetchOfferForSku(accessToken, sku) {
  const encodedSku = encodeURIComponent(sku);
  const url = `${EBAY_API_BASE}/sell/inventory/v1/offer?sku=${encodedSku}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    if (response.status === 404) {
      // No offer for this SKU
      return null;
    }
    
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`Offer API error for SKU ${sku}:`, response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.offers && data.offers.length > 0) {
      const offer = data.offers[0];
      return {
        offerId: offer.offerId,
        listingId: offer.listingId || offer.listing?.listingId,
        price: offer.pricingSummary?.price?.value 
          ? parseFloat(offer.pricingSummary.price.value) 
          : null,
        currency: offer.pricingSummary?.price?.currency || 'USD',
        status: offer.status
      };
    }
    
    return null;
  } catch (error) {
    console.warn(`Error fetching offer for SKU ${sku}:`, error.message);
    return null;
  }
}

/**
 * Transform inventory item to database listing
 */
function transformInventoryItem(item) {
  const product = item.product || {};
  const availability = item.availability?.shipToLocationAvailability || {};
  
  return {
    ebay_sku: item.sku,
    title: product.title || item.sku,
    primary_image_url: product.imageUrls?.[0] || null,
    quantity_available: availability.quantity || 0,
    description: product.description || null
  };
}

/**
 * Upsert listings to database
 */
async function upsertListing(userId, listing, offer) {
  const minimumPrice = offer?.price 
    ? parseFloat((offer.price * 0.6).toFixed(2))
    : null;
  
  const ebayUrl = offer?.listingId 
    ? `https://www.ebay.com/itm/${offer.listingId}`
    : null;
  
  const { data, error } = await supabase
    .from('listings')
    .upsert({
      user_id: userId,
      ebay_sku: listing.ebay_sku,
      sku: listing.ebay_sku, // Also set the sku field
      ebay_item_id: offer?.listingId || null,
      title: listing.title,
      current_price: offer?.price || 1.00, // Placeholder if no offer
      minimum_price: minimumPrice,
      quantity_available: listing.quantity_available,
      primary_image_url: listing.primary_image_url,
      ebay_url: ebayUrl,
      source: 'inventory_api',
      last_sync: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,ebay_item_id',
      ignoreDuplicates: false
    });
  
  if (error) {
    // If conflict on ebay_item_id fails (because it's null), try upsert on sku
    if (!offer?.listingId) {
      const { data: data2, error: error2 } = await supabase
        .from('listings')
        .upsert({
          user_id: userId,
          ebay_sku: listing.ebay_sku,
          sku: listing.ebay_sku,
          title: listing.title,
          current_price: 1.00,
          quantity_available: listing.quantity_available,
          primary_image_url: listing.primary_image_url,
          source: 'inventory_api',
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,ebay_sku'
        });
      
      return { error: error2 };
    }
  }
  
  return { error };
}

/**
 * Mark listings as Ended if they're no longer in eBay inventory
 * @param {string} userId - User ID
 * @param {string[]} activeSkus - Array of SKUs that are currently in eBay inventory
 * @returns {number} - Count of listings marked as ended
 */
async function markEndedListings(userId, activeSkus) {
  // Get all active listings from DB for this user with inventory_api source
  const { data: dbListings, error: fetchError } = await supabase
    .from('listings')
    .select('id, ebay_sku')
    .eq('user_id', userId)
    .eq('source', 'inventory_api')
    .eq('listing_status', 'Active')
    .not('ebay_sku', 'is', null);

  if (fetchError || !dbListings) {
    console.error('Error fetching DB listings for ended check:', fetchError);
    return 0;
  }

  // Find listings in DB that are NOT in eBay response (no longer active)
  const endedListings = dbListings.filter(
    dbListing => !activeSkus.includes(dbListing.ebay_sku)
  );

  if (endedListings.length === 0) {
    return 0;
  }

  // Mark them as Ended
  const endedIds = endedListings.map(l => l.id);
  const { error: updateError } = await supabase
    .from('listings')
    .update({
      listing_status: 'Ended',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .in('id', endedIds);

  if (updateError) {
    console.error('Error marking listings as ended:', updateError);
    return 0;
  }

  console.log(`📌 Marked ${endedListings.length} Inventory API listings as Ended (no longer in eBay inventory)`);
  return endedListings.length;
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
    console.log('🔄 sync-inventory-api-listings started');
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

    // Get valid eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);
    console.log('✅ Got valid eBay access token');

    // Fetch all inventory items
    console.log('📦 Fetching inventory items...');
    let apiCallSucceeded = false;
    const inventoryItems = await fetchInventoryItems(accessToken);
    // If fetchInventoryItems didn't throw, the API call succeeded (HTTP 200)
    apiCallSucceeded = true;
    console.log(`📊 Found ${inventoryItems.length} inventory items (API call succeeded: ${apiCallSucceeded})`);

    // Process each item
    const results = {
      total: inventoryItems.length,
      processed: 0,
      withOffers: 0,
      errors: []
    };

    // Collect active SKUs for ended listing check
    const activeSkus = inventoryItems.map(item => item.sku).filter(Boolean);

    for (const item of inventoryItems) {
      try {
        const listing = transformInventoryItem(item);
        
        // Fetch offer details
        const offer = await fetchOfferForSku(accessToken, item.sku);
        if (offer) {
          results.withOffers++;
        }
        
        // Upsert to database
        const { error } = await upsertListing(user.id, listing, offer);
        
        if (error) {
          console.error(`Error upserting SKU ${item.sku}:`, error);
          results.errors.push({ sku: item.sku, error: error.message });
        } else {
          results.processed++;
        }
        
      } catch (itemError) {
        console.error(`Exception processing SKU ${item.sku}:`, itemError);
        results.errors.push({ sku: item.sku, error: itemError.message });
      }
    }

    // Mark listings as Ended if they're no longer in eBay inventory
    // IMPORTANT: Only do this if the eBay API call succeeded (HTTP 200)
    // This ensures we don't accidentally mark listings as ended due to API errors
    let endedCount = 0;
    if (apiCallSucceeded) {
      endedCount = await markEndedListings(user.id, activeSkus);
      console.log(`✅ Checked for ended listings (API confirmed success, ${inventoryItems.length} items in inventory)`);
    } else {
      console.log('⚠️ Skipping ended listings check - eBay API call did not succeed');
    }

    console.log('✅ Sync complete:', { ...results, ended: endedCount });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        stats: {
          totalInventoryItems: results.total,
          processed: results.processed,
          withOffers: results.withOffers,
          ended: endedCount,
          errors: results.errors.length
        },
        errors: results.errors.length > 0 ? results.errors : undefined
      })
    };

  } catch (error) {
    console.error('❌ sync-inventory-api-listings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to sync Inventory API listings',
        message: error.message
      })
    };
  }
};
