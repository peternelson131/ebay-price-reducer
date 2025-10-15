const { schedule } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');
const { EbayApiClient } = require('./utils/ebay-api-client');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Scheduled function that runs price reductions for eligible listings
 * Runs daily at 3 AM UTC to check for listings needing price reduction
 */
const handler = async (event) => {
  console.log('🕐 Starting scheduled price reduction at', new Date().toISOString());

  try {
    // Get all users with eBay connections and price reduction enabled listings
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
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
          message: 'No users to process',
          results: { total: 0, success: 0, failed: 0 }
        })
      };
    }

    console.log(`Found ${users.length} users to check for price reductions`);

    const results = {
      totalUsers: users.length,
      usersProcessed: 0,
      totalListingsChecked: 0,
      totalPricesReduced: 0,
      errors: [],
      details: []
    };

    // Process each user's listings
    for (const user of users) {
      try {
        const userResult = await processUserPriceReductions(user);
        results.usersProcessed++;
        results.totalListingsChecked += userResult.listingsChecked;
        results.totalPricesReduced += userResult.pricesReduced;
        results.details.push({
          userId: user.id,
          email: user.email,
          listingsChecked: userResult.listingsChecked,
          pricesReduced: userResult.pricesReduced,
          status: 'success'
        });

        if (userResult.pricesReduced > 0) {
          console.log(`✅ Reduced ${userResult.pricesReduced} prices for user ${user.email}`);
        }
      } catch (error) {
        console.error(`❌ Failed to process user ${user.email}:`, error);
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

    console.log('🎉 Scheduled price reduction complete:', {
      usersProcessed: results.usersProcessed,
      totalListingsChecked: results.totalListingsChecked,
      totalPricesReduced: results.totalPricesReduced,
      errors: results.errors.length
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Scheduled price reduction completed',
        timestamp: new Date().toISOString(),
        results
      })
    };
  } catch (error) {
    console.error('💥 Scheduled price reduction failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Scheduled price reduction failed',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

/**
 * Process price reductions for a single user
 */
async function processUserPriceReductions(user) {
  console.log(`🔍 Checking price reductions for user ${user.email}...`);

  // Initialize eBay client
  const ebayClient = new EbayApiClient(user.id);

  try {
    await ebayClient.initialize();
  } catch (initError) {
    console.error(`⚠️ Failed to initialize eBay client for ${user.email}:`, initError.message);
    return { listingsChecked: 0, pricesReduced: 0 };
  }

  // Get listings eligible for price reduction
  const { data: listings, error: fetchError } = await supabase
    .from('listings')
    .select('*')
    .eq('user_id', user.id)
    .eq('price_reduction_enabled', true)
    .eq('listing_status', 'Active')
    .lte('next_price_reduction', new Date().toISOString())
    .gt('current_price', supabase.raw('minimum_price'));

  if (fetchError) {
    throw new Error(`Failed to fetch listings: ${fetchError.message}`);
  }

  if (!listings || listings.length === 0) {
    console.log(`No eligible listings for user ${user.email}`);
    return { listingsChecked: 0, pricesReduced: 0 };
  }

  console.log(`Found ${listings.length} eligible listings for user ${user.email}`);

  let pricesReduced = 0;

  for (const listing of listings) {
    try {
      // Calculate new price
      const currentPrice = parseFloat(listing.current_price);
      const minimumPrice = parseFloat(listing.minimum_price);
      const reductionPct = parseFloat(listing.reduction_percentage || 5);

      // Validate minimum price is set
      if (!listing.minimum_price || minimumPrice <= 0) {
        console.log(`⚠️ Skipping ${listing.ebay_item_id}: minimum_price not set`);
        continue;
      }

      const reductionAmount = currentPrice * (reductionPct / 100);
      let newPrice = currentPrice - reductionAmount;
      newPrice = Math.max(newPrice, minimumPrice);
      newPrice = Math.round(newPrice * 100) / 100;

      // Check if reduction is meaningful
      if (newPrice >= currentPrice) {
        console.log(`⚠️ Skipping ${listing.ebay_item_id}: new price not lower than current`);
        continue;
      }

      // Update price on eBay
      console.log(`💰 Reducing price for ${listing.ebay_item_id}: $${currentPrice} → $${newPrice}`);

      try {
        await ebayClient.updateItemPrice(listing.ebay_item_id, newPrice);

        // Calculate next reduction date
        const nextReduction = new Date();
        nextReduction.setDate(nextReduction.getDate() + (listing.reduction_interval || 7));

        // Update database
        await supabase
          .from('listings')
          .update({
            current_price: newPrice,
            last_price_reduction: new Date().toISOString(),
            next_price_reduction: nextReduction.toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', listing.id);

        pricesReduced++;

        console.log(`✅ Successfully reduced price for ${listing.ebay_item_id}`);

      } catch (ebayError) {
        console.error(`❌ Failed to update eBay price for ${listing.ebay_item_id}:`, ebayError.message);
        // Continue to next listing
      }

    } catch (itemError) {
      console.error(`❌ Error processing listing ${listing.ebay_item_id}:`, itemError.message);
      // Continue to next listing
    }
  }

  return { listingsChecked: listings.length, pricesReduced };
}

/**
 * Utility: Delay execution
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Schedule to run daily at 3 AM UTC
// Cron expression: '0 3 * * *' = At 3:00 AM every day
exports.handler = schedule('0 3 * * *', handler);
