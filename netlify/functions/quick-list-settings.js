/**
 * Quick List Settings API
 * 
 * GET - Fetch user's quick list settings + available eBay policies
 * POST - Save user's quick list settings
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Route by method
    if (event.httpMethod === 'GET') {
      return handleGet(user, headers);
    } else if (event.httpMethod === 'POST') {
      return handlePost(user, event.body, headers);
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('Quick list settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', message: error.message })
    };
  }
};

async function handleGet(user, headers) {
  // Get current settings
  const { data: settings, error: settingsError } = await supabase
    .from('quick_list_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Fetch merchant locations from eBay
  let locations = [];
  let primaryLocationKey = null;
  let locationError = null;
  
  try {
    const accessToken = await getValidAccessToken(supabase, user.id);
    
    const locationResult = await ebayApiRequest(
      accessToken,
      '/sell/inventory/v1/location',
      { method: 'GET' }
    );
    
    locations = (locationResult.locations || [])
      .filter(l => l.merchantLocationStatus === 'ENABLED')
      .map(l => ({
        key: l.merchantLocationKey,
        name: l.name || l.merchantLocationKey,
        address: l.location?.address ? 
          `${l.location.address.city || ''}, ${l.location.address.stateOrProvince || ''} ${l.location.address.postalCode || ''}`.trim() : 
          '',
        type: (l.locationTypes || [])[0] || 'UNKNOWN',
        isPrimary: (l.name || '').toLowerCase().includes('primary')
      }));
    
    // Find primary location (by name containing "primary", or first warehouse, or just first)
    const primary = locations.find(l => l.isPrimary) || 
                    locations.find(l => l.type === 'WAREHOUSE') || 
                    locations[0];
    if (primary) {
      primaryLocationKey = primary.key;
    }
  } catch (ebayError) {
    console.error('Failed to fetch eBay locations:', ebayError.message);
    locationError = ebayError.message;
  }

  // Calculate if settings are complete
  const isConfigured = settings && 
    settings.fulfillment_policy_id && 
    settings.payment_policy_id && 
    settings.return_policy_id && 
    settings.merchant_location_key;

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      settings: settings || null,
      isConfigured,
      locations,
      primaryLocationKey,
      locationError,
      requiredFields: ['fulfillment_policy_id', 'payment_policy_id', 'return_policy_id', 'merchant_location_key']
    })
  };
}

async function handlePost(user, body, headers) {
  const data = JSON.parse(body);
  
  const {
    fulfillment_policy_id,
    payment_policy_id,
    return_policy_id,
    merchant_location_key,
    sku_prefix,
    description_note
  } = data;

  // Validate required fields
  const missing = [];
  if (!fulfillment_policy_id) missing.push('fulfillment_policy_id');
  if (!payment_policy_id) missing.push('payment_policy_id');
  if (!return_policy_id) missing.push('return_policy_id');
  if (!merchant_location_key) missing.push('merchant_location_key');

  if (missing.length > 0) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'Missing required fields',
        missing
      })
    };
  }

  // Validate SKU prefix if provided (alphanumeric + underscore, max 10 chars)
  const cleanSkuPrefix = (sku_prefix || 'ql_').trim();
  if (!/^[a-zA-Z0-9_]{1,10}$/.test(cleanSkuPrefix)) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: 'SKU prefix must be 1-10 alphanumeric characters or underscores'
      })
    };
  }

  // Clean description note (limit to 1000 chars)
  const cleanDescNote = (description_note || '').trim().substring(0, 1000);

  // Upsert settings
  const { data: result, error } = await supabase
    .from('quick_list_settings')
    .upsert({
      user_id: user.id,
      fulfillment_policy_id,
      payment_policy_id,
      return_policy_id,
      merchant_location_key,
      sku_prefix: cleanSkuPrefix,
      description_note: cleanDescNote || null
    }, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    console.error('Failed to save settings:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to save settings', message: error.message })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: true,
      settings: result,
      message: 'Quick List settings saved successfully'
    })
  };
}
