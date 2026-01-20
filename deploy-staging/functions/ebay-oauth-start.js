/**
 * eBay OAuth Start - Generate authorization URL
 * 
 * GET /ebay-oauth-start
 * Returns URL for user to visit to authorize eBay access
 * 
 * Uses platform-level eBay App credentials from environment variables.
 * Users only need to OAuth to connect their seller account.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use sandbox or production based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_AUTH_URL = IS_SANDBOX 
  ? 'https://auth.sandbox.ebay.com/oauth2/authorize'
  : 'https://auth.ebay.com/oauth2/authorize';

// eBay uses RuName as redirect_uri parameter (not the actual URL)
// Get from env or use defaults
const REDIRECT_URI = process.env.EBAY_RUNAME || (IS_SANDBOX
  ? 'Peter_Nelson-PeterNel-jcasho-tdjssam'
  : 'Peter_Nelson-PeterNel-jcasho-pzwkq');

const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
].join(' ');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate user from auth header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authorization required' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const userId = user.id;

    // Use platform-level eBay App credentials from environment
    const clientId = process.env.EBAY_CLIENT_ID;
    
    if (!clientId) {
      console.error('EBAY_CLIENT_ID not configured in environment');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'eBay integration not configured. Contact support.' }) };
    }

    // Generate state (userId + random for CSRF protection)
    const state = Buffer.from(JSON.stringify({
      userId,
      nonce: Math.random().toString(36).substring(2)
    })).toString('base64');

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: EBAY_SCOPES,
      state: state
    });

    const authUrl = `${EBAY_AUTH_URL}?${params.toString()}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authUrl,
        message: 'Visit this URL to authorize eBay access (valid for 18 months)'
      })
    };

  } catch (error) {
    console.error('Error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
