/**
 * eBay OAuth Start - Generate authorization URL
 * 
 * GET /ebay-oauth-start?userId=xxx
 * Returns URL for user to visit to authorize eBay access
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { decrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EBAY_AUTH_URL = 'https://auth.ebay.com/oauth2/authorize';
const REDIRECT_URI = 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth-callback';

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
    // Get user from auth header or query param
    let userId = event.queryStringParameters?.userId;
    
    if (!userId) {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      if (authHeader) {
        const token = authHeader.substring(7);
        const { data: { user } } = await supabase.auth.getUser(token);
        userId = user?.id;
      }
    }

    if (!userId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'userId required' }) };
    }

    // Get user's eBay app credentials
    const { data: user, error } = await supabase
      .from('users')
      .select('ebay_client_id')
      .eq('id', userId)
      .single();

    if (error || !user?.ebay_client_id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'eBay client credentials not configured' }) };
    }

    const clientId = decrypt(user.ebay_client_id);

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
