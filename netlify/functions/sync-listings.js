const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { UserEbayClient } = require('./utils/user-ebay-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
          message: 'Please provide a valid authentication token'
        })
      };
    }

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authentication token',
          message: 'Please log in again'
        })
      };
    }

    // Initialize user-specific eBay client
    const userEbayClient = new UserEbayClient(user.id);
    await userEbayClient.initialize();

    // Check if user has valid eBay connection
    if (!userEbayClient.accessToken) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'eBay account not connected',
          message: 'Please connect your eBay account first',
          redirectTo: '/ebay-setup'
        })
      };
    }

    // Fetch listings from eBay using user's credentials
    const ebayResponse = await userEbayClient.getActiveListings(1, 200);

    let syncedCount = 0;
    let errorCount = 0;
    const errors = [];

    if (ebayResponse.ActiveList?.ItemArray?.Item) {
      const items = Array.isArray(ebayResponse.ActiveList.ItemArray.Item)
        ? ebayResponse.ActiveList.ItemArray.Item
        : [ebayResponse.ActiveList.ItemArray.Item];

      for (const item of items) {
        try {
          // Parse price data
          const priceData = item.SellingStatus?.CurrentPrice;
          const currentPrice = priceData?._ || priceData || 0;
          const currency = priceData?.currencyID || 'USD';

          // Upsert listing to database
          const { error: upsertError } = await supabase
            .from('listings')
            .upsert({
              user_id: user.id,
              ebay_item_id: item.ItemID,
              title: item.Title,
              current_price: parseFloat(currentPrice),
              currency: currency,
              quantity: parseInt(item.Quantity) || 0,
              listing_type: item.ListingType,
              category_id: item.PrimaryCategory?.CategoryID,
              category_name: item.PrimaryCategory?.CategoryName,
              end_time: item.EndTime,
              watch_count: parseInt(item.WatchCount) || 0,
              hit_count: parseInt(item.HitCount) || 0,
              listing_url: item.ListingDetails?.ViewItemURL,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id,ebay_item_id'
            });

          if (upsertError) {
            errors.push(`Item ${item.ItemID}: ${upsertError.message}`);
            errorCount++;
          } else {
            syncedCount++;
          }
        } catch (itemError) {
          errors.push(`Item ${item.ItemID}: ${itemError.message}`);
          errorCount++;
        }
      }
    }

    // Log sync results to console (sync_errors table removed)
    console.log('Sync operation completed:', {
      user_id: user.id,
      operation: 'sync_listings',
      success_count: syncedCount,
      error_count: errorCount,
      errors: errors.slice(0, 10),
      timestamp: new Date().toISOString()
    });

    if (errorCount > 0) {
      console.error('Sync errors encountered:', errors.slice(0, 10));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        syncedCount,
        errorCount,
        errors: errors.slice(0, 5), // Return first 5 errors
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Sync failed:', error);

    // Log critical error to console (sync_errors table removed)
    console.error('Critical sync error:', {
      user_id: user?.id || 'unknown',
      operation: 'sync_listings',
      success_count: 0,
      error_count: 1,
      errors: [error.message],
      timestamp: new Date().toISOString()
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };