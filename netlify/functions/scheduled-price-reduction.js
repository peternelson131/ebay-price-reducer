/**
 * Scheduled Price Reduction
 * 
 * F-BG001: Automated price reduction job
 * Runs every 4 hours via Netlify scheduled functions
 * 
 * Flow:
 * 1. Get all users with eBay connected
 * 2. For each user, get listings due for reduction
 * 3. Process reductions using existing logic
 * 4. Log results
 */

const { createClient } = require('@supabase/supabase-js');
const { getValidAccessToken } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Check if a listing is due for price reduction
 */
function isDueForReduction(listing) {
  if (!listing.enable_auto_reduction) {
    return false;
  }
  
  if (listing.listing_status !== 'Active') {
    return false;
  }
  
  // Check if already at minimum price
  const currentPrice = parseFloat(listing.current_price);
  let minimumPrice = parseFloat(listing.minimum_price);
  
  // F-PRC003: Handle invalid minimum prices
  if (isNaN(minimumPrice) || minimumPrice <= 0) {
    minimumPrice = 0.99;
  }
  
  if (currentPrice <= minimumPrice) {
    return false;
  }
  
  // Get interval from strategy if available, else use listing default
  const strategy = listing.strategies;
  let intervalHours;
  
  if (strategy && strategy.frequency_days) {
    intervalHours = strategy.frequency_days * 24;
  } else {
    intervalHours = parseInt(listing.reduction_interval || 24);
  }
  
  const lastReduction = listing.last_price_reduction 
    ? new Date(listing.last_price_reduction)
    : new Date(0);
  
  const hoursSinceLastReduction = (Date.now() - lastReduction.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceLastReduction >= intervalHours;
}

/**
 * Main scheduled handler
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  console.log('⏰ Scheduled price reduction started at', new Date().toISOString());
  
  const results = {
    usersProcessed: 0,
    listingsChecked: 0,
    listingsDue: 0,
    reductionsApplied: 0,
    errors: [],
    skipped: 0
  };

  try {
    // Get all users with eBay connected (have refresh token)
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, email')
      .not('ebay_refresh_token', 'is', null);
    
    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }
    
    console.log(`👥 Found ${users?.length || 0} users with eBay connected`);
    
    for (const user of (users || [])) {
      try {
        results.usersProcessed++;
        
        // Get valid access token for this user
        let accessToken;
        try {
          accessToken = await getValidAccessToken(supabase, user.id);
        } catch (tokenError) {
          console.warn(`⚠️ Could not get token for user ${user.id}: ${tokenError.message}`);
          results.errors.push({ userId: user.id, error: `Token error: ${tokenError.message}` });
          continue;
        }
        
        // Get listings with their strategies
        const { data: listings, error: listingsError } = await supabase
          .from('listings')
          .select('*, strategies(*)')
          .eq('user_id', user.id)
          .eq('enable_auto_reduction', true)
          .eq('listing_status', 'Active')
          .is('ended_at', null);
        
        if (listingsError) {
          console.error(`Failed to fetch listings for user ${user.id}:`, listingsError.message);
          results.errors.push({ userId: user.id, error: listingsError.message });
          continue;
        }
        
        results.listingsChecked += listings?.length || 0;
        
        // Filter to only listings due for reduction
        const dueListings = (listings || []).filter(isDueForReduction);
        results.listingsDue += dueListings.length;
        
        console.log(`📊 User ${user.id}: ${listings?.length || 0} listings, ${dueListings.length} due`);
        
        // Process each due listing
        for (const listing of dueListings) {
          try {
            const result = await processListingReduction(supabase, accessToken, listing);
            if (result.success) {
              results.reductionsApplied++;
            } else if (result.skipped) {
              results.skipped++;
            }
          } catch (listingError) {
            console.error(`Error processing listing ${listing.id}:`, listingError.message);
            results.errors.push({ 
              listingId: listing.id, 
              title: listing.title,
              error: listingError.message 
            });
          }
        }
        
      } catch (userError) {
        console.error(`Error processing user ${user.id}:`, userError.message);
        results.errors.push({ userId: user.id, error: userError.message });
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Scheduled price reduction completed in ${duration}s`);
    console.log(`📈 Results:`, JSON.stringify(results, null, 2));
    
    // Log summary to database for monitoring
    try {
      await supabase.from('system_logs').insert({
        event_type: 'scheduled_price_reduction',
        status: 'success',
        details: results,
        duration_ms: Date.now() - startTime,
        created_at: new Date().toISOString()
      });
    } catch (logError) {
      console.warn('Could not log to system_logs:', logError.message);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Scheduled price reduction completed',
        duration: `${duration}s`,
        results
      })
    };
    
  } catch (error) {
    console.error('❌ Scheduled price reduction failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        results
      })
    };
  }
};

/**
 * Process a single listing reduction
 * Extracted from process-price-reductions.js for reuse
 */
async function processListingReduction(supabase, accessToken, listing) {
  const strategy = listing.strategies;
  
  // Calculate new price
  const currentPrice = parseFloat(listing.current_price);
  let minimumPrice = parseFloat(listing.minimum_price);
  
  // F-PRC003: Validate minimum
  if (isNaN(minimumPrice) || minimumPrice <= 0) {
    minimumPrice = 0.99;
  }
  if (minimumPrice >= currentPrice) {
    return { skipped: true, reason: 'At or below minimum' };
  }
  
  // Determine reduction type and amount
  let reductionType = 'percentage';
  let reductionValue = parseFloat(listing.reduction_percentage || 2);
  
  if (strategy) {
    reductionType = strategy.reduction_type || strategy.strategy_type || 'percentage';
    if (reductionType === 'dollar') {
      reductionValue = parseFloat(strategy.reduction_amount);
    } else {
      reductionValue = parseFloat(strategy.reduction_amount || strategy.reduction_percentage || 5);
    }
  }
  
  // Calculate reduction
  let reduction;
  if (reductionType === 'dollar') {
    reduction = reductionValue;
  } else {
    reduction = currentPrice * (reductionValue / 100);
  }
  
  let newPrice = currentPrice - reduction;
  newPrice = Math.round(newPrice * 100) / 100;
  
  if (newPrice < minimumPrice) {
    newPrice = minimumPrice;
  }
  
  if (newPrice >= currentPrice) {
    return { skipped: true, reason: 'New price not lower' };
  }
  
  const reductionApplied = Math.round((currentPrice - newPrice) * 100) / 100;
  
  console.log(`💰 ${listing.title?.substring(0, 40)}...: $${currentPrice} → $${newPrice}`);
  
  // Update price on eBay
  const { updatePriceTradingApi } = require('./update-price-trading-api');
  
  if (listing.source === 'trading_api') {
    await updatePriceTradingApi(accessToken, listing, newPrice);
  } else {
    // Inventory API update
    await updatePriceInventoryApi(accessToken, listing, newPrice);
  }
  
  // Update database
  await supabase
    .from('listings')
    .update({
      current_price: newPrice,
      last_price_reduction: new Date().toISOString(),
      total_reductions: (listing.total_reductions || 0) + 1,
      updated_at: new Date().toISOString()
    })
    .eq('id', listing.id);
  
  // Log reduction
  await supabase.from('price_reduction_log').insert({
    listing_id: listing.id,
    user_id: listing.user_id,
    ebay_item_id: listing.ebay_item_id || listing.ebay_listing_id || 'unknown',
    sku: listing.ebay_sku,
    title: listing.title,
    original_price: currentPrice,
    reduced_price: newPrice,
    reduction_amount: reductionApplied,
    reduction_percentage: ((reductionApplied / currentPrice) * 100).toFixed(2),
    reduction_type: 'scheduled',
    reduction_method: reductionType,
    reduction_strategy: strategy?.name || null,
    strategy_id: strategy?.id || null,
    created_at: new Date().toISOString()
  });
  
  return { success: true, oldPrice: currentPrice, newPrice, reductionApplied };
}

/**
 * Update price via Inventory API
 */
async function updatePriceInventoryApi(accessToken, listing, newPrice) {
  const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
  const EBAY_API_BASE = IS_SANDBOX
    ? 'https://api.sandbox.ebay.com'
    : 'https://api.ebay.com';
    
  if (!listing.ebay_sku) {
    throw new Error('Listing has no ebay_sku for Inventory API');
  }
  
  const fetch = require('node-fetch');
  const url = `${EBAY_API_BASE}/sell/inventory/v1/bulk_update_price_quantity`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      requests: [{
        sku: listing.ebay_sku,
        shipToLocationAvailability: {
          quantity: listing.quantity_available || 1
        },
        offers: [{
          offerId: listing.offer_id,
          price: {
            value: newPrice.toFixed(2),
            currency: 'USD'
          }
        }]
      }]
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Inventory API error: ${response.status} - ${errorText}`);
  }
  
  return await response.json();
}
