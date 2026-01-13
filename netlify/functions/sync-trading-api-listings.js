/**
 * Sync Trading API Listings
 * 
 * Task 1: Import listings via eBay Trading API (XML)
 * - Calls GetMyeBaySelling to get active listings
 * - Parses XML response
 * - Upserts to database (match on ebay_item_id)
 * - Sets source='trading_api', minimum_price = current_price * 0.6
 * - Handles pagination (200 items/page)
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
const TRADING_API_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

const ITEMS_PER_PAGE = 200;
const COMPATIBILITY_LEVEL = 967;

/**
 * Build GetMyeBaySelling XML request
 */
function buildGetMyeBaySellingRequest(pageNumber = 1) {
  return `<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>${ITEMS_PER_PAGE}</EntriesPerPage>
      <PageNumber>${pageNumber}</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>`;
}

/**
 * Parse XML response to extract listings
 */
function parseListingsFromXml(xmlText) {
  const listings = [];
  
  // Extract Ack status (Success, Warning, Failure, PartialFailure)
  const ackMatch = xmlText.match(/<Ack>([^<]+)<\/Ack>/);
  const ack = ackMatch ? ackMatch[1] : 'Unknown';
  
  // Extract total pages for pagination
  const totalPagesMatch = xmlText.match(/<TotalNumberOfPages>(\d+)<\/TotalNumberOfPages>/);
  const totalPages = totalPagesMatch ? parseInt(totalPagesMatch[1]) : 1;
  
  // Extract total entries
  const totalEntriesMatch = xmlText.match(/<TotalNumberOfEntries>(\d+)<\/TotalNumberOfEntries>/);
  const totalEntries = totalEntriesMatch ? parseInt(totalEntriesMatch[1]) : 0;
  
  // Check for errors
  const errorMatch = xmlText.match(/<ShortMessage>([^<]+)<\/ShortMessage>/);
  if (errorMatch && xmlText.includes('<Severity>Error</Severity>')) {
    throw new Error(`eBay API Error: ${errorMatch[1]}`);
  }
  
  // Extract items from ItemArray
  const itemArrayMatch = xmlText.match(/<ItemArray>([\s\S]*?)<\/ItemArray>/);
  if (!itemArrayMatch) {
    return { listings: [], totalPages, totalEntries, ack };
  }
  
  const itemArray = itemArrayMatch[1];
  
  // Match individual items
  const itemRegex = /<Item>([\s\S]*?)<\/Item>/g;
  let match;
  
  while ((match = itemRegex.exec(itemArray)) !== null) {
    const item = match[1];
    
    // Extract fields
    const getField = (fieldName) => {
      const fieldMatch = item.match(new RegExp(`<${fieldName}>([^<]*)</${fieldName}>`));
      return fieldMatch ? fieldMatch[1] : null;
    };
    
    // Extract nested CurrentPrice value
    const currentPriceMatch = item.match(/<CurrentPrice[^>]*>([^<]+)<\/CurrentPrice>/);
    const currentPrice = currentPriceMatch ? parseFloat(currentPriceMatch[1]) : null;
    
    // Extract SellingStatus fields
    const quantitySoldMatch = item.match(/<QuantitySold>(\d+)<\/QuantitySold>/);
    const quantitySold = quantitySoldMatch ? parseInt(quantitySoldMatch[1]) : 0;
    
    // Extract picture URLs
    const galleryUrlMatch = item.match(/<GalleryURL>([^<]+)<\/GalleryURL>/);
    const pictureUrlMatch = item.match(/<PictureURL>([^<]+)<\/PictureURL>/);
    const imageUrl = galleryUrlMatch ? galleryUrlMatch[1] : (pictureUrlMatch ? pictureUrlMatch[1] : null);
    
    const listing = {
      ebay_sku: getField('SKU'),
      ebay_item_id: getField('ItemID'),
      title: getField('Title'),
      current_price: currentPrice,
      quantity_available: parseInt(getField('Quantity') || '0'),
      quantity_sold: quantitySold,
      listing_status: getField('ListingStatus') || 'Active',
      primary_image_url: imageUrl,
      ebay_url: getField('ViewItemURL')
    };
    
    // Only add if we have an item ID
    if (listing.ebay_item_id) {
      listings.push(listing);
    }
  }
  
  return { listings, totalPages, totalEntries, ack };
}

/**
 * Call Trading API
 */
async function callTradingApi(accessToken, requestXml) {
  const response = await fetch(TRADING_API_URL, {
    method: 'POST',
    headers: {
      'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
      'X-EBAY-API-SITEID': '0',
      'X-EBAY-API-COMPATIBILITY-LEVEL': String(COMPATIBILITY_LEVEL),
      'X-EBAY-API-IAF-TOKEN': accessToken,
      'Content-Type': 'text/xml'
    },
    body: requestXml
  });
  
  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('Trading API HTTP error:', response.status, responseText.substring(0, 500));
    throw new Error(`Trading API HTTP error: ${response.status}`);
  }
  
  return responseText;
}

/**
 * Upsert listings to database
 */
async function upsertListings(userId, listings) {
  const results = { inserted: 0, updated: 0, errors: [] };
  
  for (const listing of listings) {
    try {
      const minimumPrice = listing.current_price 
        ? parseFloat((listing.current_price * 0.6).toFixed(2))
        : null;
      
      const { data, error } = await supabase
        .from('listings')
        .upsert({
          user_id: userId,
          ebay_sku: listing.ebay_sku,
          ebay_item_id: listing.ebay_item_id,
          title: listing.title,
          current_price: listing.current_price,
          minimum_price: minimumPrice,
          quantity_available: listing.quantity_available,
          quantity_sold: listing.quantity_sold,
          listing_status: listing.listing_status,
          primary_image_url: listing.primary_image_url,
          ebay_url: listing.ebay_url,
          source: 'trading_api',
          last_sync: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,ebay_item_id',
          ignoreDuplicates: false
        });
      
      if (error) {
        console.error(`Error upserting listing ${listing.ebay_item_id}:`, error);
        results.errors.push({ ebay_item_id: listing.ebay_item_id, error: error.message });
      } else {
        results.updated++; // upsert counts as update
      }
    } catch (err) {
      console.error(`Exception upserting listing ${listing.ebay_item_id}:`, err);
      results.errors.push({ ebay_item_id: listing.ebay_item_id, error: err.message });
    }
  }
  
  return results;
}

/**
 * Mark listings as Ended if they're no longer in eBay active listings
 * @param {string} userId - User ID
 * @param {string[]} activeItemIds - Array of eBay item IDs that are currently active
 * @returns {number} - Count of listings marked as ended
 */
async function markEndedListings(userId, activeItemIds) {
  // Get all active listings from DB for this user with trading_api source
  const { data: dbListings, error: fetchError } = await supabase
    .from('listings')
    .select('id, ebay_item_id')
    .eq('user_id', userId)
    .eq('source', 'trading_api')
    .eq('listing_status', 'Active')
    .not('ebay_item_id', 'is', null);

  if (fetchError || !dbListings) {
    console.error('Error fetching DB listings for ended check:', fetchError);
    return 0;
  }

  // Find listings in DB that are NOT in eBay response (no longer active)
  const endedListings = dbListings.filter(
    dbListing => !activeItemIds.includes(dbListing.ebay_item_id)
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

  console.log(`📌 Marked ${endedListings.length} Trading API listings as Ended (no longer active on eBay)`);
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
    console.log('🔄 sync-trading-api-listings started');
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

    // Fetch all pages
    let allListings = [];
    let currentPage = 1;
    let totalPages = 1;
    let totalEntries = 0;

    let apiCallSucceeded = false;
    
    do {
      console.log(`📄 Fetching page ${currentPage}...`);
      
      const requestXml = buildGetMyeBaySellingRequest(currentPage);
      const responseXml = await callTradingApi(accessToken, requestXml);
      
      const { listings, totalPages: tp, totalEntries: te, ack } = parseListingsFromXml(responseXml);
      
      // Track if we got a successful response from eBay
      if (ack === 'Success' || ack === 'Warning') {
        apiCallSucceeded = true;
      }
      console.log(`📡 eBay API Ack: ${ack}`);
      
      totalPages = tp;
      totalEntries = te;
      allListings = allListings.concat(listings);
      
      console.log(`✅ Page ${currentPage}: Found ${listings.length} listings (total pages: ${totalPages})`);
      
      currentPage++;
    } while (currentPage <= totalPages);

    console.log(`📊 Total listings fetched: ${allListings.length}, API call succeeded: ${apiCallSucceeded}`);

    // Upsert to database
    const upsertResults = await upsertListings(user.id, allListings);
    
    // Get list of active eBay item IDs from the response
    const activeItemIds = allListings
      .map(l => l.ebay_item_id)
      .filter(Boolean);
    
    // Mark listings as Ended if they're no longer in eBay active listings
    // IMPORTANT: Only do this if eBay API returned a Success/Warning response
    // This ensures we don't accidentally mark listings as ended due to API errors
    let endedCount = 0;
    if (apiCallSucceeded) {
      endedCount = await markEndedListings(user.id, activeItemIds);
      console.log(`✅ Checked for ended listings (API confirmed success)`);
    } else {
      console.log('⚠️ Skipping ended listings check - eBay API did not return Success/Warning response');
    }
    
    console.log('✅ Sync complete:', { ...upsertResults, ended: endedCount });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        stats: {
          totalFetched: allListings.length,
          totalPages: totalPages,
          updated: upsertResults.updated,
          ended: endedCount,
          errors: upsertResults.errors.length
        },
        errors: upsertResults.errors.length > 0 ? upsertResults.errors : undefined
      })
    };

  } catch (error) {
    console.error('❌ sync-trading-api-listings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to sync Trading API listings',
        message: error.message
      })
    };
  }
};
