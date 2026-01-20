/**
 * eBay Settings API
 * 
 * GET - Fetch user's eBay settings + available options from eBay
 * POST - Save user's eBay settings
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

    if (event.httpMethod === 'GET') {
      return await getSettings(user.id, headers);
    } else if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body);
      return await saveSettings(user.id, body, headers);
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (error) {
    console.error('eBay settings error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function getSettings(userId, headers) {
  // Get user's current settings
  const { data: user, error } = await supabase
    .from('users')
    .select(`
      ebay_fulfillment_policy_id,
      ebay_payment_policy_id,
      ebay_return_policy_id,
      ebay_merchant_location_key,
      ebay_default_condition,
      ebay_sku_prefix,
      ebay_connection_status
    `)
    .eq('id', userId)
    .single();

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to fetch settings' }) };
  }

  // If not connected to eBay, return just the settings
  if (user.ebay_connection_status !== 'connected') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        settings: {
          fulfillmentPolicyId: user.ebay_fulfillment_policy_id,
          paymentPolicyId: user.ebay_payment_policy_id,
          returnPolicyId: user.ebay_return_policy_id,
          merchantLocationKey: user.ebay_merchant_location_key,
          defaultCondition: user.ebay_default_condition || 'NEW',
          skuPrefix: user.ebay_sku_prefix || 'wi_'
        },
        options: null,
        message: 'Connect eBay account to fetch available policies'
      })
    };
  }

  // Fetch available options from eBay
  try {
    const accessToken = await getValidAccessToken(supabase, userId);

    // Fetch all policy types in parallel
    const [fulfillmentPolicies, paymentPolicies, returnPolicies, locations] = await Promise.all([
      fetchPolicies(accessToken, 'fulfillment_policy'),
      fetchPolicies(accessToken, 'payment_policy'),
      fetchPolicies(accessToken, 'return_policy'),
      fetchLocations(accessToken)
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        settings: {
          fulfillmentPolicyId: user.ebay_fulfillment_policy_id,
          paymentPolicyId: user.ebay_payment_policy_id,
          returnPolicyId: user.ebay_return_policy_id,
          merchantLocationKey: user.ebay_merchant_location_key,
          defaultCondition: user.ebay_default_condition || 'NEW',
          skuPrefix: user.ebay_sku_prefix || 'wi_'
        },
        options: {
          fulfillmentPolicies,
          paymentPolicies,
          returnPolicies,
          locations,
          conditions: [
            { value: 'NEW', label: 'New' },
            { value: 'LIKE_NEW', label: 'Like New' },
            { value: 'NEW_OTHER', label: 'New (Other)' },
            { value: 'MANUFACTURER_REFURBISHED', label: 'Manufacturer Refurbished' },
            { value: 'SELLER_REFURBISHED', label: 'Seller Refurbished' },
            { value: 'USED_EXCELLENT', label: 'Used - Excellent' },
            { value: 'USED_VERY_GOOD', label: 'Used - Very Good' },
            { value: 'USED_GOOD', label: 'Used - Good' },
            { value: 'USED_ACCEPTABLE', label: 'Used - Acceptable' }
          ]
        }
      })
    };

  } catch (ebayError) {
    console.error('Failed to fetch eBay options:', ebayError);
    // Return settings without options if eBay API fails
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        settings: {
          fulfillmentPolicyId: user.ebay_fulfillment_policy_id,
          paymentPolicyId: user.ebay_payment_policy_id,
          returnPolicyId: user.ebay_return_policy_id,
          merchantLocationKey: user.ebay_merchant_location_key,
          defaultCondition: user.ebay_default_condition || 'NEW',
          skuPrefix: user.ebay_sku_prefix || 'wi_'
        },
        options: null,
        message: 'Failed to fetch eBay options: ' + ebayError.message
      })
    };
  }
}

async function fetchPolicies(accessToken, policyType) {
  try {
    const data = await ebayApiRequest(
      accessToken,
      `/sell/account/v1/${policyType}?marketplace_id=EBAY_US`
    );

    const policyKey = policyType.replace('_', '') + 's'; // fulfillment_policy -> fulfillmentPolicies
    const policies = data[policyKey] || [];

    return policies.map(p => ({
      id: p[policyType.replace('_', '') + 'Id'], // fulfillmentPolicyId
      name: p.name,
      description: p.description
    }));
  } catch (error) {
    console.error(`Failed to fetch ${policyType}:`, error.message);
    return [];
  }
}

async function fetchLocations(accessToken) {
  try {
    const data = await ebayApiRequest(accessToken, '/sell/inventory/v1/location');
    
    return (data.locations || []).map(loc => ({
      key: loc.merchantLocationKey,
      name: loc.name || loc.merchantLocationKey,
      address: loc.location?.address ? 
        `${loc.location.address.city || ''}, ${loc.location.address.stateOrProvince || ''} ${loc.location.address.postalCode || ''}`.trim() : 
        null,
      status: loc.merchantLocationStatus
    })).filter(loc => loc.status === 'ENABLED');
  } catch (error) {
    console.error('Failed to fetch locations:', error.message);
    return [];
  }
}

async function saveSettings(userId, settings, headers) {
  const updateData = {};

  if (settings.fulfillmentPolicyId !== undefined) {
    updateData.ebay_fulfillment_policy_id = settings.fulfillmentPolicyId;
  }
  if (settings.paymentPolicyId !== undefined) {
    updateData.ebay_payment_policy_id = settings.paymentPolicyId;
  }
  if (settings.returnPolicyId !== undefined) {
    updateData.ebay_return_policy_id = settings.returnPolicyId;
  }
  if (settings.merchantLocationKey !== undefined) {
    updateData.ebay_merchant_location_key = settings.merchantLocationKey;
  }
  if (settings.defaultCondition !== undefined) {
    updateData.ebay_default_condition = settings.defaultCondition;
  }
  if (settings.skuPrefix !== undefined) {
    updateData.ebay_sku_prefix = settings.skuPrefix;
  }

  if (Object.keys(updateData).length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'No settings provided' }) };
  }

  const { error } = await supabase
    .from('users')
    .update(updateData)
    .eq('id', userId);

  if (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save settings' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, message: 'Settings saved' })
  };
}
