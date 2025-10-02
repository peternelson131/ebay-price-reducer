const { createClient } = require('@supabase/supabase-js');
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  let user = null; // Declare user outside try block for error handling

  try {
    // Get authenticated user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: userData, error: authError } = await supabase.auth.getUser(token);
    user = userData?.user; // Assign to outer scope variable

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`🔄 Manual sync triggered for user: ${user.email}`);

    // Initialize EnhancedEbayClient
    const ebayClient = new EnhancedEbayClient(user.id);
    await ebayClient.initialize();

    // Fetch all listings with view/watch counts
    const ebayData = await ebayClient.fetchAllListings({
      limit: 100,
      offset: 0,
      includeViewCounts: true,
      includeWatchCounts: true
    });

    console.log(`✅ Fetched ${ebayData.listings.length} listings from eBay`);

    if (ebayData.listings.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'No listings found in eBay account',
          count: 0
        })
      };
    }

    // Prepare listings for upsert
    const listingsToUpsert = ebayData.listings.map(listing => ({
      user_id: user.id,
      ebay_item_id: listing.ebay_item_id,
      sku: listing.sku,
      title: listing.title,
      description: listing.description,
      current_price: listing.current_price,
      original_price: listing.original_price || listing.current_price,
      currency: listing.currency,
      quantity: listing.quantity,
      quantity_available: listing.quantity,
      image_urls: listing.image_urls,
      condition: listing.condition || 'Used',
      category_id: listing.category_id,
      category: listing.category_name,
      listing_status: listing.listing_status,
      listing_format: listing.listing_type || 'FixedPriceItem',
      start_time: listing.start_time,
      end_time: listing.end_time,
      view_count: listing.view_count || 0,
      watch_count: listing.watch_count || 0,
      hit_count: listing.hit_count || 0,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));

    // Upsert to database
    const { data, error } = await supabase
      .from('listings')
      .upsert(listingsToUpsert, {
        onConflict: 'user_id,ebay_item_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('❌ Failed to upsert listings:', error);
      throw error;
    }

    console.log(`✅ Successfully synced ${listingsToUpsert.length} listings to database`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Sync completed successfully',
        count: listingsToUpsert.length,
        listings: ebayData.listings.map(l => ({
          sku: l.sku,
          title: l.title,
          price: l.current_price,
          views: l.view_count,
          watchers: l.watch_count
        }))
      })
    };

  } catch (error) {
    console.error('💥 Sync failed:', {
      userId: user?.id || 'unknown',
      error: error.message,
      stack: error.stack
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Sync failed',
        message: error.message,
        details: {
          userId: user?.id,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
};
