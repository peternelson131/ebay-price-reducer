/**
 * Process Price Reductions
 * 
 * Task 5: Route price updates by listing source
 * - Check listing.source
 * - If 'trading_api' → use ReviseFixedPriceItem (Task 4)
 * - If 'inventory_api' → use bulkUpdatePriceQuantity
 * 
 * This function processes automatic price reductions for enabled listings.
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { updatePriceTradingApi } = require('./update-price-trading-api');

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
 * Update price via Inventory API (bulkUpdatePriceQuantity)
 */
async function updatePriceInventoryApi(accessToken, listing, newPrice) {
  if (!listing.ebay_sku) {
    throw new Error('Listing has no ebay_sku for Inventory API');
  }
  
  console.log(`📝 Updating Inventory API listing ${listing.ebay_sku} to $${newPrice}`);
  
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
          offerId: listing.offer_id, // If we have it
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
    console.error('Inventory API error:', response.status, errorText);
    throw new Error(`Inventory API error: ${response.status}`);
  }
  
  const result = await response.json();
  
  // Check for errors in response
  if (result.responses?.[0]?.statusCode !== 200) {
    const errorMsg = result.responses?.[0]?.errors?.[0]?.message || 'Unknown error';
    throw new Error(errorMsg);
  }
  
  return result;
}

/**
 * Fetch strategy for a listing if it has a strategy_id
 */
async function getStrategyForListing(listing) {
  if (!listing.strategy_id) {
    return null;
  }
  
  const { data: strategy, error } = await supabase
    .from('strategies')
    .select('*')
    .eq('id', listing.strategy_id)
    .single();
  
  if (error) {
    console.warn(`Failed to fetch strategy ${listing.strategy_id}:`, error.message);
    return null;
  }
  
  return strategy;
}

/**
 * Calculate new price based on reduction strategy
 * Supports both percentage and dollar reduction types
 * 
 * @param {Object} listing - The listing record
 * @param {Object} strategy - The strategy record (optional, fetched if listing has strategy_id)
 * @returns {Object} { newPrice, reductionType, reductionApplied }
 */
function calculateNewPrice(listing, strategy = null) {
  const currentPrice = parseFloat(listing.current_price);
  let minimumPrice = parseFloat(listing.minimum_price);
  
  // F-PRC003: Validate minimum price to handle edge cases
  if (isNaN(minimumPrice) || minimumPrice <= 0) {
    minimumPrice = 0.99; // Sensible default floor - never reduce below $0.99
    console.log(`⚠️ Invalid minimum_price for listing ${listing.id}, using default $0.99`);
  }
  if (minimumPrice >= currentPrice) {
    console.log(`⚠️ Listing ${listing.id} already at or below minimum ($${currentPrice} <= $${minimumPrice})`);
    return {
      newPrice: currentPrice,
      reductionType: 'none',
      reductionValue: 0,
      reductionApplied: 0,
      skipped: true,
      reason: 'At or below minimum price'
    };
  }
  
  // Determine reduction parameters from strategy or fallback to listing defaults
  let reductionType = 'percentage';
  let reductionValue = parseFloat(listing.reduction_percentage || 2); // Default 2%
  
  if (strategy) {
    // Handle both schema versions:
    // UAT: reduction_type, reduction_amount
    // Production: strategy_type, reduction_percentage/reduction_amount
    reductionType = strategy.reduction_type || strategy.strategy_type || 'percentage';
    
    if (reductionType === 'dollar') {
      reductionValue = parseFloat(strategy.reduction_amount);
    } else {
      // For percentage, check both column names
      reductionValue = parseFloat(strategy.reduction_amount || strategy.reduction_percentage || 5);
    }
    console.log(`📊 Using strategy "${strategy.name}": ${reductionType} reduction of ${reductionType === 'dollar' ? '$' : ''}${reductionValue}${reductionType === 'percentage' ? '%' : ''}`);
  } else {
    console.log(`📊 No strategy, using listing fallback: ${reductionValue}%`);
  }
  
  // Calculate reduction based on type
  let reduction;
  if (reductionType === 'dollar') {
    // Dollar amount - subtract fixed amount
    reduction = reductionValue;
  } else {
    // Percentage - calculate percentage of current price
    reduction = currentPrice * (reductionValue / 100);
  }
  
  let newPrice = currentPrice - reduction;
  
  // Round to 2 decimal places
  newPrice = Math.round(newPrice * 100) / 100;
  
  // Ensure we don't go below minimum
  const actualReduction = currentPrice - Math.max(newPrice, minimumPrice);
  if (newPrice < minimumPrice) {
    newPrice = minimumPrice;
  }
  
  return {
    newPrice,
    reductionType,
    reductionValue,
    reductionApplied: Math.round(actualReduction * 100) / 100
  };
}

/**
 * Check if listing is due for price reduction
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
  const minimumPrice = parseFloat(listing.minimum_price);
  if (currentPrice <= minimumPrice) {
    return false;
  }
  
  // Check reduction interval
  const intervalHours = parseInt(listing.reduction_interval || 24);
  const lastReduction = listing.last_price_reduction 
    ? new Date(listing.last_price_reduction)
    : new Date(0);
  
  const hoursSinceLastReduction = (Date.now() - lastReduction.getTime()) / (1000 * 60 * 60);
  
  return hoursSinceLastReduction >= intervalHours;
}

/**
 * Process a single listing price reduction
 * @param {string} accessToken - eBay access token (null for dry run)
 * @param {Object} listing - The listing to process
 * @param {boolean} dryRun - If true, skip eBay API calls
 */
async function processListing(accessToken, listing, dryRun = false) {
  // Fetch strategy if listing has one assigned
  const strategy = await getStrategyForListing(listing);
  
  // Calculate new price using strategy or fallback
  const priceResult = calculateNewPrice(listing, strategy);
  const { newPrice, reductionType, reductionValue, reductionApplied, skipped, reason } = priceResult;
  
  // F-PRC003: Handle early return from calculateNewPrice (e.g., at minimum)
  if (skipped) {
    return { skipped: true, reason: reason || 'Skipped by calculateNewPrice' };
  }
  
  if (newPrice >= listing.current_price) {
    return { skipped: true, reason: 'New price not lower (at minimum or no reduction)' };
  }
  
  const reductionDisplay = reductionType === 'dollar' 
    ? `$${reductionValue}` 
    : `${reductionValue}%`;
  console.log(`💰 Processing listing ${listing.id}: $${listing.current_price} → $${newPrice} (${reductionDisplay} ${reductionType}, source: ${listing.source})${dryRun ? ' [DRY RUN]' : ''}`);
  
  if (!dryRun) {
    // Route based on source - only call eBay if not dry run
    if (listing.source === 'trading_api') {
      await updatePriceTradingApi(accessToken, listing, newPrice);
    } else {
      // Default to Inventory API
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
    
    // Log reduction with type info
    try {
      await supabase.from('price_reduction_log').insert({
        listing_id: listing.id,
        user_id: listing.user_id,
        ebay_item_id: listing.ebay_item_id || listing.ebay_listing_id || 'unknown',
        sku: listing.ebay_sku,
        title: listing.title,
        original_price: listing.current_price,
        reduced_price: newPrice,
        reduction_amount: reductionApplied,
        reduction_percentage: ((reductionApplied / listing.current_price) * 100).toFixed(2),
        reduction_type: 'automated', // source: manual/scheduled/automated
        reduction_method: reductionType, // method: percentage/dollar
        reduction_strategy: strategy?.name || null,
        strategy_id: strategy?.id || null,
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.warn('Failed to log price reduction:', e.message);
    }
  } else {
    console.log(`🧪 DRY RUN: Would update ${listing.title} from $${listing.current_price} to $${newPrice}`);
  }
  
  return {
    success: true,
    dryRun: dryRun,
    oldPrice: listing.current_price,
    newPrice: newPrice,
    reductionType,
    reductionApplied
  };
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
    console.log('💰 process-price-reductions started');
    console.log(`Environment: ${IS_SANDBOX ? 'SANDBOX' : 'PRODUCTION'}`);

    // Authenticate user (or allow scheduled trigger with API key)
    const authHeader = event.headers.authorization || event.headers.Authorization;
    let userId = null;
    
    // Check for scheduled job trigger or dry-run test mode
    const { scheduled, userId: requestedUserId, dryRun, testSecret, internalScheduled } = event.body ? JSON.parse(event.body) : {};
    
    // Allow dry-run testing with a simple secret (for UAT verification)
    const isDryRunTest = dryRun && testSecret === 'uat-test-2026';
    
    // F-BG001: Internal scheduled call from scheduled-price-reduction.js
    const isInternalScheduled = internalScheduled === 'netlify-scheduled-function';
    
    if (isDryRunTest) {
      console.log('🧪 DRY RUN TEST MODE - will calculate but not call eBay API');
      if (requestedUserId) {
        userId = requestedUserId;
      }
    } else if (isInternalScheduled) {
      // Internal call from Netlify scheduled function or manual trigger - trusted
      if (dryRun) {
        console.log('🧪 INTERNAL DRY RUN MODE - will calculate but not call eBay API');
      } else {
        console.log('⏰ SCHEDULED MODE - processing all users');
      }
      // userId stays null to process all users
    } else if (scheduled && process.env.SCHEDULED_JOB_SECRET) {
      // Scheduled job mode - process specific user or all users
      if (requestedUserId) {
        userId = requestedUserId;
      }
    } else if (authHeader) {
      // User-initiated mode
      const token = authHeader.substring(7);
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid token' })
        };
      }
      userId = user.id;
    } else {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    console.log(`✅ Processing for user: ${userId || 'all users'}`);

    // Build query for listings due for reduction
    let query = supabase
      .from('listings')
      .select('*')
      .eq('listing_status', 'Active')
      .is('ended_at', null)
      .eq('enable_auto_reduction', true); // Use only enable_auto_reduction for production compatibility
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data: listings, error: fetchError } = await query;
    
    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    console.log(`📊 Found ${listings?.length || 0} listings with auto-reduction enabled`);

    // Filter to only listings due for reduction
    const dueListings = (listings || []).filter(isDueForReduction);
    console.log(`📊 ${dueListings.length} listings due for reduction`);

    // Group by user to get access tokens efficiently
    const userListings = {};
    for (const listing of dueListings) {
      if (!userListings[listing.user_id]) {
        userListings[listing.user_id] = [];
      }
      userListings[listing.user_id].push(listing);
    }

    const results = {
      processed: 0,
      skipped: 0,
      errors: []
    };

    // Process each user's listings
    for (const [uid, userDueListings] of Object.entries(userListings)) {
      try {
        // Combined dry run check: test mode OR internal scheduled with dryRun flag
        const shouldDryRun = isDryRunTest || (isInternalScheduled && dryRun);
        
        // Skip token fetch for dry run mode
        const accessToken = shouldDryRun ? null : await getValidAccessToken(supabase, uid);
        
        for (const listing of userDueListings) {
          try {
            const result = await processListing(accessToken, listing, shouldDryRun);
            if (result.skipped) {
              results.skipped++;
            } else if (result.success) {
              results.processed++;
              // Include details in dry run mode
              if (shouldDryRun) {
                results.details = results.details || [];
                results.details.push({
                  listingId: listing.id,
                  title: listing.title,
                  oldPrice: result.oldPrice,
                  newPrice: result.newPrice,
                  reductionType: result.reductionType,
                  reductionApplied: result.reductionApplied
                });
              }
            }
          } catch (listingError) {
            console.error(`Error processing listing ${listing.id}:`, listingError);
            results.errors.push({
              listingId: listing.id,
              error: listingError.message
            });
          }
        }
      } catch (userError) {
        console.error(`Error getting token for user ${uid}:`, userError);
        results.errors.push({
          userId: uid,
          error: userError.message
        });
      }
    }

    console.log('✅ Price reductions complete:', results);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        dryRun: isDryRunTest || (isInternalScheduled && dryRun) || false,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        stats: {
          totalEnabled: listings?.length || 0,
          dueForReduction: dueListings.length,
          processed: results.processed,
          skipped: results.skipped,
          errors: results.errors.length
        },
        details: results.details, // Included in dry run mode
        errors: results.errors.length > 0 ? results.errors : undefined
      })
    };

  } catch (error) {
    console.error('❌ process-price-reductions error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to process price reductions',
        message: error.message
      })
    };
  }
};
