/**
 * eBay OAuth Start
 * 
 * Initiates OAuth flow using platform-level eBay App credentials.
 * Users do NOT need to provide their own Client ID/Secret.
 * 
 * GET or POST /ebay-auth-start
 * Returns the eBay authorization URL for user to visit
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

  // Accept both GET and POST for flexibility
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
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

    // 2. Use platform-level eBay App credentials from environment
    const clientId = process.env.EBAY_CLIENT_ID;
    
    if (!clientId) {
      console.error('EBAY_CLIENT_ID not configured in environment');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'eBay integration not configured. Contact support.' })
      };
    }

    // 3. Generate a random state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex') + ':' + user.id;
    const encryptedState = encrypt(state);

    // Update user's connection status to pending
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_oauth_state: encryptedState,
        ebay_connection_status: 'pending'
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to update user state:', updateError);
      // Non-fatal, continue with OAuth
    }

    // 4. Generate eBay authorization URL
    const redirectUri = getRedirectUri(event);
    const authUrl = generateAuthUrl(clientId, redirectUri, state);

    console.log(`eBay auth started for user ${user.id}`);

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
