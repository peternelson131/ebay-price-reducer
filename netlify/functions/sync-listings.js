const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const EbayClient = require('./utils/ebay-client');

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
    // Get user ID from request
    const { userId } = JSON.parse(event.body || '{}');

    if (!userId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing userId parameter'
        })
      };
    }

    // Initialize eBay client
    const ebayClient = new EbayClient();

    // Fetch listings from eBay
    const ebayResponse = await ebayClient.getMyeBaySelling();

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
              user_id: userId,
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

    // Log sync results
    const { error: logError } = await supabase
      .from('sync_errors')
      .insert({
        user_id: userId,
        operation: 'sync_listings',
        success_count: syncedCount,
        error_count: errorCount,
        errors: errors.slice(0, 10),
        created_at: new Date().toISOString()
      });

    if (logError) {
      console.warn('Failed to log sync results:', logError);
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

    // Log critical error
    try {
      await supabase
        .from('sync_errors')
        .insert({
          user_id: JSON.parse(event.body || '{}').userId || 'unknown',
          operation: 'sync_listings',
          success_count: 0,
          error_count: 1,
          errors: [error.message],
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Failed to log critical error:', logError);
    }

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