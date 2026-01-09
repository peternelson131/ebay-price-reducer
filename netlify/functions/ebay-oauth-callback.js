/**
 * eBay OAuth Callback
 * 
 * Step 2 of OAuth flow:
 * - eBay redirects here after user authorizes
 * - We exchange the code for tokens
 * - Store tokens encrypted in user's database row
 * - Redirect user back to the app
 */

const { createClient } = require('@supabase/supabase-js');
const { encrypt, decrypt } = require('./utils/encryption');
const { exchangeCodeForTokens } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Frontend URL to redirect after OAuth
const getFrontendUrl = (event) => {
  const host = event.headers.host || event.headers.Host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  // Redirect to API Keys page
  return `${protocol}://${host}/api-keys`;
};

const getRedirectUri = (event) => {
  const host = event.headers.host || event.headers.Host;
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}/.netlify/functions/ebay-oauth-callback`;
};

exports.handler = async (event, context) => {
  // This is a GET request from eBay's redirect
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: 'Method not allowed'
    };
  }

  const frontendUrl = getFrontendUrl(event);

  try {
    // 1. Parse query parameters from eBay
    const params = event.queryStringParameters || {};
    const { code, state, error, error_description } = params;

    // Handle eBay errors
    if (error) {
      console.error('eBay OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent(error_description || error)}`
        },
        body: ''
      };
    }

    if (!code || !state) {
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('Missing authorization code or state')}`
        },
        body: ''
      };
    }

    // 2. Extract user ID from state and verify
    // State format: randomHex:userId
    const stateParts = state.split(':');
    if (stateParts.length < 2) {
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('Invalid state parameter')}`
        },
        body: ''
      };
    }

    const userId = stateParts[1];

    // 3. Get user's stored credentials and verify state
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('ebay_client_id, ebay_client_secret, ebay_oauth_state')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      console.error('User not found:', userId);
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('User not found')}`
        },
        body: ''
      };
    }

    // Verify state matches (CSRF protection)
    const storedState = decrypt(user.ebay_oauth_state);
    if (storedState !== state) {
      console.error('State mismatch - possible CSRF attack');
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('Invalid state - please try again')}`
        },
        body: ''
      };
    }

    // 4. Decrypt credentials
    const clientId = decrypt(user.ebay_client_id);
    const clientSecret = decrypt(user.ebay_client_secret);

    if (!clientId || !clientSecret) {
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('Credentials not found - please re-enter')}`
        },
        body: ''
      };
    }

    // 5. Exchange code for tokens
    const redirectUri = getRedirectUri(event);
    const tokens = await exchangeCodeForTokens(code, clientId, clientSecret, redirectUri);

    // 6. Store tokens encrypted
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: encrypt(tokens.access_token),
        ebay_refresh_token: encrypt(tokens.refresh_token),
        ebay_token_expires_at: expiresAt.toISOString(),
        ebay_connection_status: 'connected',
        ebay_oauth_state: null // Clear the state after successful auth
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return {
        statusCode: 302,
        headers: {
          Location: `${frontendUrl}?ebay_error=${encodeURIComponent('Failed to save connection')}`
        },
        body: ''
      };
    }

    console.log(`eBay OAuth completed for user ${userId}`);

    // 7. Redirect back to app with success
    return {
      statusCode: 302,
      headers: {
        Location: `${frontendUrl}?ebay_connected=true`
      },
      body: ''
    };

  } catch (error) {
    console.error('eBay OAuth callback error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `${frontendUrl}?ebay_error=${encodeURIComponent(error.message || 'Authorization failed')}`
      },
      body: ''
    };
  }
};
