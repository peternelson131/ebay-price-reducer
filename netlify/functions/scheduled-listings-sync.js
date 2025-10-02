const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { EnhancedEbayClient } = require('./utils/enhanced-ebay-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function that syncs all users' eBay listings every 6 hours
 * Runs at: 00:00, 06:00, 12:00, 18:00 UTC
 */
const handler = async (event) => {
  console.log('🕐 Starting scheduled listings sync at', new Date().toISOString());

  try {
    // Get all users with eBay connections
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email, ebay_app_id, ebay_cert_id, ebay_refresh_token')
      .not('ebay_refresh_token', 'is', null);

    if (usersError) {
      console.error('Failed to fetch users:', usersError);
      throw usersError;
    }

    if (!users || users.length === 0) {
      console.log('No users with eBay connections found');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No users to sync',
          results: { total: 0, success: 0, failed: 0 }
        })
      };
    }

    console.log(`Found ${users.length} users to sync`);

    const results = {
      total: users.length,
      success: 0,
      failed: 0,
      errors: [],
      details: []
    };

    // Sync each user's listings
    for (const user of users) {
      try {
        const syncResult = await syncUserListings(user);
        results.success++;
        results.details.push({
          userId: user.id,
          email: user.email,
          listingsSynced: syncResult.count,
          status: 'success'
        });
        console.log(`✅ Synced ${syncResult.count} listings for user ${user.email}`);
      } catch (error) {
        console.error(`❌ Failed to sync user ${user.email}:`, error);
        results.failed++;
        results.errors.push({
          userId: user.id,
          email: user.email,
          error: error.message
        });
        results.details.push({
          userId: user.id,
          email: user.email,
          status: 'failed',
          error: error.message
        });
      }

      // Add small delay between users to avoid rate limits
      await delay(1000);
    }

    console.log('🎉 Scheduled sync complete:', {
      total: results.total,
      success: results.success,
      failed: results.failed,
      errors: results.errors.length
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled sync completed',
        timestamp: new Date().toISOString(),
        results
      })
    };
  } catch (error) {
    console.error('💥 Scheduled sync failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Scheduled sync failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Sync listings for a single user
 */
async function syncUserListings(user) {
  console.log(`🔄 Syncing listings for user ${user.email}...`);

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

  if (!ebayData.listings || ebayData.listings.length === 0) {
    console.log(`No listings found for user ${user.email}`);
    return { count: 0 };
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
    console.error(`Failed to upsert listings for user ${user.email}:`, error);
    throw error;
  }

  console.log(`✅ Successfully synced ${listingsToUpsert.length} listings for user ${user.email}`);

  return { count: listingsToUpsert.length };
}

/**
 * Utility: Delay execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Schedule to run every 6 hours
// Cron expression: '0 */6 * * *' = At minute 0 past every 6th hour
// This will run at: 00:00, 06:00, 12:00, 18:00 UTC
exports.handler = schedule('0 */6 * * *', handler);
