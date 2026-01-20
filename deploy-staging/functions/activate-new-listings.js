/**
 * Auto-Activate Repricing for New Listings
 * 
 * Task 7: Enable auto-reduction for new listings
 * - Find Active listings created in last 2 days with enable_auto_reduction=false
 * - Set enable_auto_reduction=true
 * - Optional: filter by SKU pattern (e.g., 'WI_%')
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Environment detection
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';

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
    console.log('🚀 activate-new-listings started');
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

    // Parse options
    const options = event.body ? JSON.parse(event.body) : {};
    const skuPattern = options.skuPattern || null; // e.g., 'WI_%' or 'wi_%'
    const daysBack = options.daysBack || 2; // Default: last 2 days
    const dryRun = options.dryRun || false; // If true, don't actually update

    // Calculate date threshold
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - daysBack);
    const dateThresholdStr = dateThreshold.toISOString();

    console.log(`📊 Looking for listings created after: ${dateThresholdStr}`);
    if (skuPattern) {
      console.log(`📊 SKU pattern filter: ${skuPattern}`);
    }

    // Build query for eligible listings
    let query = supabase
      .from('listings')
      .select('id, title, ebay_sku, sku, created_at, enable_auto_reduction, price_reduction_enabled')
      .eq('user_id', user.id)
      .eq('listing_status', 'Active')
      .is('ended_at', null)
      .gte('created_at', dateThresholdStr)
      .or('enable_auto_reduction.eq.false,enable_auto_reduction.is.null')
      .or('price_reduction_enabled.eq.false,price_reduction_enabled.is.null');

    // Add SKU pattern filter if specified
    if (skuPattern) {
      // Convert SQL LIKE pattern to ilike
      query = query.or(`ebay_sku.ilike.${skuPattern},sku.ilike.${skuPattern}`);
    }

    const { data: listings, error: fetchError } = await query;

    if (fetchError) {
      throw new Error(`Failed to fetch listings: ${fetchError.message}`);
    }

    console.log(`📊 Found ${listings?.length || 0} listings eligible for activation`);

    if (dryRun) {
      console.log('🔍 Dry run mode - not updating');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          dryRun: true,
          environment: IS_SANDBOX ? 'sandbox' : 'production',
          stats: {
            eligible: listings?.length || 0
          },
          listings: listings?.map(l => ({
            id: l.id,
            title: l.title?.substring(0, 50),
            sku: l.ebay_sku || l.sku,
            created_at: l.created_at
          }))
        })
      };
    }

    // Activate repricing for all eligible listings
    const listingIds = (listings || []).map(l => l.id);
    
    if (listingIds.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          environment: IS_SANDBOX ? 'sandbox' : 'production',
          stats: {
            eligible: 0,
            activated: 0
          },
          message: 'No listings to activate'
        })
      };
    }

    // Batch update
    const { error: updateError, count } = await supabase
      .from('listings')
      .update({
        enable_auto_reduction: true,
        price_reduction_enabled: true,
        updated_at: new Date().toISOString()
      })
      .in('id', listingIds);

    if (updateError) {
      throw new Error(`Failed to update listings: ${updateError.message}`);
    }

    console.log(`✅ Activated ${listingIds.length} listings`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        environment: IS_SANDBOX ? 'sandbox' : 'production',
        stats: {
          eligible: listings?.length || 0,
          activated: listingIds.length
        },
        activatedListings: listings?.map(l => ({
          id: l.id,
          title: l.title?.substring(0, 50),
          sku: l.ebay_sku || l.sku
        }))
      })
    };

  } catch (error) {
    console.error('❌ activate-new-listings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to activate new listings',
        message: error.message
      })
    };
  }
};
