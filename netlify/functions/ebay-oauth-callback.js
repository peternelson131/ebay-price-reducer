/**
 * eBay OAuth Callback - Exchange code for tokens
 * 
 * GET /ebay-oauth-callback?code=xxx&state=xxx
 * Called by eBay after user authorizes
 * Exchanges code for access_token + refresh_token (18 months)
 * 
 * Uses platform-level eBay App credentials from environment variables.
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { encrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use sandbox or production based on environment
const IS_SANDBOX = process.env.EBAY_ENVIRONMENT === 'sandbox';
const EBAY_TOKEN_URL = IS_SANDBOX
  ? 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'
  : 'https://api.ebay.com/identity/v1/oauth2/token';

// eBay uses RuName as redirect_uri parameter (must match authorize request)
const REDIRECT_URI = process.env.EBAY_RUNAME || (IS_SANDBOX
  ? 'Peter_Nelson-PeterNel-jcasho-tdjssam'
  : 'Peter_Nelson-PeterNel-jcasho-pzwkq');

// App URL for redirects after OAuth (actual browser redirect)
const APP_URL = IS_SANDBOX
  ? 'https://ebay-price-reducer-uat.netlify.app'
  : 'https://dainty-horse-49c336.netlify.app';

const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment'
].join(' ');

exports.handler = async (event, context) => {
  try {
    const { code, state, error, error_description } = event.queryStringParameters || {};

    // Handle eBay errors
    if (error) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>❌ eBay Authorization Failed</h1>
            <p>${error_description || error}</p>
            <p>Please try again.</p>
          </body></html>
        `
      };
    }

    if (!code || !state) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>Missing code or state</h1></body></html>'
      };
    }

    // Decode state to get userId
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
    } catch (e) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>Invalid state</h1></body></html>'
      };
    }

    const { userId } = stateData;

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>User not found</h1></body></html>'
      };
    }

    // Use platform-level eBay App credentials from environment
    const clientId = process.env.EBAY_CLIENT_ID;
    const clientSecret = process.env.EBAY_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      console.error('EBAY_CLIENT_ID or EBAY_CLIENT_SECRET not configured');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>eBay integration not configured</h1></body></html>'
      };
    }

    // Exchange code for tokens
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const tokenResponse = await fetch(EBAY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: REDIRECT_URI
      })
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', tokenData);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Token Exchange Failed</h1>
            <p>${tokenData.error_description || tokenData.error || 'Unknown error'}</p>
          </body></html>
        `
      };
    }

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

    // Store tokens (encrypted)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: encrypt(tokenData.access_token),
        ebay_refresh_token: encrypt(tokenData.refresh_token),
        ebay_token_expires_at: expiresAt.toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'text/html' },
        body: `
          <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1>❌ Failed to Store Tokens</h1>
            <p>${updateError.message}</p>
          </body></html>
        `
      };
    }

    // Success!
    // Redirect back to the app with success indicator
    const successUrl = `${APP_URL}/account?ebay_connected=true`;
    
    return {
      statusCode: 302,
      headers: { 
        'Location': successUrl,
        'Cache-Control': 'no-cache'
      },
      body: ''
    };

  } catch (error) {
    console.error('Callback error:', error);
    // Redirect back to app with error
    const errorMessage = encodeURIComponent(error.message);
    const errorUrl = `${APP_URL}/account?ebay_error=${errorMessage}`;
    
    return {
      statusCode: 302,
      headers: { 
        'Location': errorUrl,
        'Cache-Control': 'no-cache'
      },
      body: ''
    };
  }
};
