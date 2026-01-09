/**
 * eBay OAuth Start
 * 
 * Step 1 of OAuth flow:
 * - User submits their eBay Client ID and Client Secret
 * - We store them encrypted
 * - Return the eBay authorization URL for them to visit
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { encrypt } = require('./utils/encryption');
const { generateAuthUrl } = require('./utils/ebay-oauth');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// The redirect URI must match what's configured in eBay Developer Console
const getRedirectUri = (event) => {
  const host = event.headers.host || event.headers.Host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/.netlify/functions/ebay-oauth-callback`;
};

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
    // 1. Authenticate user
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

    // 2. Parse request body
    const { clientId, clientSecret } = JSON.parse(event.body);

    if (!clientId || !clientSecret) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Client ID and Client Secret are required' })
      };
    }

    // Validate format (basic check)
    if (clientId.length < 10 || clientSecret.length < 10) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid Client ID or Client Secret format' })
      };
    }

    // 3. Store encrypted credentials
    const encryptedClientId = encrypt(clientId);
    const encryptedClientSecret = encrypt(clientSecret);

    // Generate a random state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex') + ':' + user.id;
    const encryptedState = encrypt(state);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_client_id: encryptedClientId,
        ebay_client_secret: encryptedClientSecret,
        ebay_oauth_state: encryptedState, // Store state for verification
        ebay_connection_status: 'pending'
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to store eBay credentials:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to store credentials' })
      };
    }

    // 4. Generate eBay authorization URL
    const redirectUri = getRedirectUri(event);
    const authUrl = generateAuthUrl(clientId, redirectUri, state);

    console.log(`eBay auth started for user ${user.id}`);
    // Never log credentials!

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        authUrl: authUrl,
        message: 'Redirect user to authUrl to complete eBay authorization'
      })
    };

  } catch (error) {
    console.error('eBay auth start error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to start eBay authorization' })
    };
  }
};
