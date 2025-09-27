const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const EbayClient = require('./utils/ebay-client');

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
    // Get listings that need price reduction
    const { data: listings, error: fetchError } = await supabase
      .from('listings')
      .select(`
        *,
        reduction_strategies (*)
      `)
      .eq('price_reduction_enabled', true)
      .gte('end_time', new Date().toISOString())
      .order('created_at', { ascending: true });

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    const ebayClient = new EbayClient();
    let processedCount = 0;
    let reducedCount = 0;
    const results = [];

    for (const listing of listings) {
      try {
        // Check if price reduction is needed
        const shouldReduce = await checkPriceReductionConditions(listing);

        if (shouldReduce.reduce) {
          // Calculate new price
          const newPrice = calculateNewPrice(listing, shouldReduce.strategy);

          // Validate new price
          if (newPrice >= listing.current_price) {
            console.log(`Skipping ${listing.ebay_item_id}: New price not lower than current`);
            continue;
          }

          // Update price on eBay
          const ebayResponse = await ebayClient.reviseItemPrice(
            listing.ebay_item_id,
            newPrice
          );

          if (ebayResponse.Ack === 'Success') {
            // Update database
            await supabase
              .from('listings')
              .update({
                current_price: newPrice,
                updated_at: new Date().toISOString()
              })
              .eq('id', listing.id);

            // Log price change
            await supabase
              .from('price_history')
              .insert({
                listing_id: listing.id,
                old_price: listing.current_price,
                new_price: newPrice,
                change_reason: shouldReduce.reason,
                created_at: new Date().toISOString()
              });

            // Send notification
            await sendPriceReductionNotification(listing, newPrice, shouldReduce.reason);

            reducedCount++;
            results.push({
              itemId: listing.ebay_item_id,
              title: listing.title,
              oldPrice: listing.current_price,
              newPrice: newPrice,
              reason: shouldReduce.reason,
              status: 'success'
            });
          } else {
            results.push({
              itemId: listing.ebay_item_id,
              title: listing.title,
              status: 'error',
              error: 'eBay update failed'
            });
          }
        }

        processedCount++;
      } catch (itemError) {
        console.error(`Error processing item ${listing.ebay_item_id}:`, itemError);
        results.push({
          itemId: listing.ebay_item_id,
          title: listing.title,
          status: 'error',
          error: itemError.message
        });
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        processedCount,
        reducedCount,
        results: results.slice(0, 10), // Return first 10 results
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Price reduction engine failed:', error);
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

// Helper function to check if price reduction is needed
async function checkPriceReductionConditions(listing) {
  const now = new Date();
  const endTime = new Date(listing.end_time);
  const timeRemaining = endTime.getTime() - now.getTime();
  const daysRemaining = timeRemaining / (1000 * 60 * 60 * 24);

  // Default strategy if none exists
  const strategy = listing.reduction_strategies || {
    reduction_percentage: 5,
    minimum_price: listing.current_price * 0.7,
    time_trigger_days: 3,
    watch_count_threshold: 5
  };

  // Check if we've reduced price recently (within 24 hours)
  const twentyFourHoursAgo = new Date();
  twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);

  const { data: recentReduction } = await supabase
    .from('price_history')
    .select('created_at')
    .eq('listing_id', listing.id)
    .gte('created_at', twentyFourHoursAgo.toISOString())
    .limit(1);

  if (recentReduction && recentReduction.length > 0) {
    return { reduce: false, reason: 'Price reduced recently' };
  }

  // Check time-based trigger
  if (daysRemaining <= strategy.time_trigger_days && daysRemaining > 0) {
    return {
      reduce: true,
      strategy,
      reason: `Time trigger: ${daysRemaining.toFixed(1)} days remaining`
    };
  }

  // Check watch count trigger (low interest)
  if (listing.watch_count < strategy.watch_count_threshold && daysRemaining <= 7) {
    return {
      reduce: true,
      strategy,
      reason: `Low interest: ${listing.watch_count} watchers`
    };
  }

  // Check if price is too high compared to similar items (placeholder)
  // TODO: Implement market comparison logic

  return { reduce: false };
}

// Helper function to calculate new price
function calculateNewPrice(listing, strategy) {
  const currentPrice = listing.current_price;
  const reductionAmount = currentPrice * (strategy.reduction_percentage / 100);
  const newPrice = currentPrice - reductionAmount;

  // Ensure price doesn't go below minimum
  const minimumPrice = strategy.minimum_price || (currentPrice * 0.5);

  return Math.max(parseFloat(newPrice.toFixed(2)), parseFloat(minimumPrice.toFixed(2)));
}

// Helper function to send price reduction notification
async function sendPriceReductionNotification(listing, newPrice, reason) {
  try {
    await supabase
      .from('notifications')
      .insert({
        user_id: listing.user_id,
        type: 'price_reduction',
        title: 'Price Reduced',
        message: `Price for "${listing.title}" reduced from $${listing.current_price} to $${newPrice}. Reason: ${reason}`,
        data: {
          listingId: listing.id,
          ebayItemId: listing.ebay_item_id,
          oldPrice: listing.current_price,
          newPrice: newPrice,
          reason: reason
        },
        created_at: new Date().toISOString()
      });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}

module.exports = { handler };