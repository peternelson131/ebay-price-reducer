/**
 * Test Quick List Settings - for debugging
 * Calls the same logic as quick-list-settings but for a specific user
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pete's user ID
const TEST_USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const results = {
    step: 'start',
    errors: []
  };

  try {
    // Step 1: Get settings from DB
    results.step = 'get_settings';
    const { data: settings, error: settingsError } = await supabase
      .from('quick_list_settings')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .single();
    
    results.settings = settings;
    results.settingsError = settingsError?.message;

    // Step 2: Get eBay access token
    results.step = 'get_ebay_token';
    let accessToken;
    try {
      accessToken = await getValidAccessToken(supabase, TEST_USER_ID);
      results.hasAccessToken = !!accessToken;
      results.accessTokenPreview = accessToken ? accessToken.substring(0, 20) + '...' : null;
    } catch (tokenError) {
      results.tokenError = tokenError.message;
      results.errors.push('Token: ' + tokenError.message);
    }

    // Step 3: Fetch locations from eBay
    if (accessToken) {
      results.step = 'fetch_locations';
      try {
        const locationResult = await ebayApiRequest(
          accessToken,
          '/sell/inventory/v1/location',
          { method: 'GET' }
        );
        
        results.locationResult = {
          total: locationResult.total,
          locationCount: (locationResult.locations || []).length,
          locations: (locationResult.locations || []).map(l => ({
            key: l.merchantLocationKey,
            name: l.name,
            status: l.merchantLocationStatus
          }))
        };
      } catch (locError) {
        results.locationError = locError.message;
        results.errors.push('Location: ' + locError.message);
      }
    }

    results.step = 'complete';
    results.success = results.errors.length === 0;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    results.fatalError = error.message;
    results.stack = error.stack;
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(results, null, 2)
    };
  }
};
