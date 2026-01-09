/**
 * eBay OAuth Callback - Exchange code for tokens
 * 
 * GET /ebay-oauth-callback?code=xxx&state=xxx
 * Called by eBay after user authorizes
 * Exchanges code for access_token + refresh_token (18 months)
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const EBAY_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const REDIRECT_URI = 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth-callback';

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

    // Get user's eBay credentials
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('ebay_client_id, ebay_client_secret')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'text/html' },
        body: '<html><body><h1>User not found</h1></body></html>'
      };
    }

    const clientId = decrypt(user.ebay_client_id);
    const clientSecret = decrypt(user.ebay_client_secret);

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
    const refreshExpiry = new Date(Date.now() + 18 * 30 * 24 * 60 * 60 * 1000); // ~18 months
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>✅ eBay Connected Successfully!</h1>
          <p style="font-size: 18px; color: #28a745;">Your eBay account is now linked.</p>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px auto; max-width: 400px;">
            <p><strong>Access Token:</strong> Valid for 2 hours (auto-refreshes)</p>
            <p><strong>Refresh Token:</strong> Valid until ~${refreshExpiry.toLocaleDateString()}</p>
          </div>
          <p>You can close this window.</p>
        </body>
        </html>
      `
    };

  } catch (error) {
    console.error('Callback error:', error);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `
        <html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h1>❌ Error</h1>
          <p>${error.message}</p>
        </body></html>
      `
    };
  }
};
