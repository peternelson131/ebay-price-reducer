const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * eBay OAuth Flow Handler
 * Handles user-level eBay account connections using OAuth 2.0
 */
exports.handler = async (event, context) => {
  const { httpMethod, queryStringParameters, body } = event;

  try {
    // Get user from Authorization header
    const authHeader = event.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Authorization required' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    switch (httpMethod) {
      case 'GET':
        if (queryStringParameters?.action === 'auth-url') {
          return await generateAuthUrl(user.id);
        } else if (queryStringParameters?.code) {
          return await handleCallback(user.id, queryStringParameters);
        } else if (queryStringParameters?.action === 'status') {
          return await getConnectionStatus(user.id);
        }
        break;

      case 'POST':
        const requestBody = JSON.parse(body || '{}');
        if (requestBody.action === 'disconnect') {
          return await disconnectEbayAccount(user.id);
        } else if (requestBody.action === 'refresh-token') {
          return await refreshAccessToken(user.id);
        }
        break;

      case 'DELETE':
        return await disconnectEbayAccount(user.id);

      default:
        return {
          statusCode: 405,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Invalid request' })
    };

  } catch (error) {
    console.error('eBay OAuth error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};

/**
 * Generate eBay OAuth authorization URL
 */
async function generateAuthUrl(userId) {
  try {
    // Generate state parameter for security
    const state = crypto.randomBytes(32).toString('hex');

    // Store state in database for verification
    await supabase
      .from('user_preferences')
      .upsert({
        user_id: userId,
        preference_key: 'ebay_oauth_state',
        preference_value: state
      });

    // eBay OAuth 2.0 parameters
    const clientId = process.env.EBAY_APP_ID;
    const redirectUri = `${process.env.URL}/.netlify/functions/ebay-oauth`;
    const scope = 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.account';

    const authUrl = `https://auth.ebay.com/oauth2/authorize?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `response_type=code&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `scope=${encodeURIComponent(scope)}&` +
      `state=${state}`;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        authUrl,
        state
      })
    };

  } catch (error) {
    console.error('Error generating auth URL:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to generate authorization URL' })
    };
  }
}

/**
 * Handle eBay OAuth callback
 */
async function handleCallback(userId, params) {
  try {
    const { code, state, error: oauthError } = params;

    if (oauthError) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `OAuth error: ${oauthError}` })
      };
    }

    // Verify state parameter
    const { data: stateRecord } = await supabase
      .from('user_preferences')
      .select('preference_value')
      .eq('user_id', userId)
      .eq('preference_key', 'ebay_oauth_state')
      .single();

    if (!stateRecord || stateRecord.preference_value !== state) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid state parameter' })
      };
    }

    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(code);

    if (!tokenResponse.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: tokenResponse.error })
      };
    }

    // Store tokens in database
    const { data, error } = await supabase.rpc('update_user_ebay_token', {
      user_uuid: userId,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_in: tokenResponse.expires_in
    });

    if (error) {
      console.error('Database error storing tokens:', error);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to store eBay credentials' })
      };
    }

    // Clean up state
    await supabase
      .from('user_preferences')
      .delete()
      .eq('user_id', userId)
      .eq('preference_key', 'ebay_oauth_state');

    // Redirect to frontend success page
    return {
      statusCode: 302,
      headers: {
        'Location': `${process.env.URL}?ebay_connected=true`
      }
    };

  } catch (error) {
    console.error('Callback handling error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to process authorization callback' })
    };
  }
}

/**
 * Get user's eBay connection status
 */
async function getConnectionStatus(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('ebay_connection_status, ebay_connected_at, ebay_user_id, ebay_token_expires_at')
      .eq('id', userId)
      .single();

    if (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to get connection status' })
      };
    }

    const isTokenValid = data.ebay_token_expires_at ?
      new Date(data.ebay_token_expires_at) > new Date() : false;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        connected: data.ebay_connection_status === 'connected',
        connectedAt: data.ebay_connected_at,
        ebayUserId: data.ebay_user_id,
        tokenValid: isTokenValid,
        tokenExpiresAt: data.ebay_token_expires_at
      })
    };

  } catch (error) {
    console.error('Error getting connection status:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to get connection status' })
    };
  }
}

/**
 * Disconnect user's eBay account
 */
async function disconnectEbayAccount(userId) {
  try {
    const { data, error } = await supabase.rpc('disconnect_user_ebay_account', {
      user_uuid: userId
    });

    if (error) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to disconnect eBay account' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'eBay account disconnected successfully'
      })
    };

  } catch (error) {
    console.error('Error disconnecting eBay account:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to disconnect eBay account' })
    };
  }
}

/**
 * Refresh eBay access token
 */
async function refreshAccessToken(userId) {
  try {
    // Get current refresh token
    const { data: credentials } = await supabase.rpc('get_user_ebay_credentials', {
      user_uuid: userId
    });

    if (!credentials || !credentials[0]?.refresh_token) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No refresh token available' })
      };
    }

    // Request new access token using refresh token
    const refreshResponse = await refreshEbayToken(credentials[0].refresh_token);

    if (!refreshResponse.success) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: refreshResponse.error })
      };
    }

    // Update tokens in database
    await supabase.rpc('update_user_ebay_token', {
      user_uuid: userId,
      access_token: refreshResponse.access_token,
      expires_in: refreshResponse.expires_in
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Token refreshed successfully',
        expiresIn: refreshResponse.expires_in
      })
    };

  } catch (error) {
    console.error('Error refreshing token:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to refresh token' })
    };
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeCodeForToken(code) {
  try {
    const clientId = process.env.EBAY_APP_ID;
    const clientSecret = process.env.EBAY_CERT_ID;
    const redirectUri = `${process.env.URL}/.netlify/functions/ebay-oauth`;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error_description || data.error || 'Token exchange failed'
      };
    }

    return {
      success: true,
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      token_type: data.token_type
    };

  } catch (error) {
    console.error('Token exchange error:', error);
    return {
      success: false,
      error: 'Failed to exchange authorization code'
    };
  }
}

/**
 * Refresh eBay access token using refresh token
 */
async function refreshEbayToken(refreshToken) {
  try {
    const clientId = process.env.EBAY_APP_ID;
    const clientSecret = process.env.EBAY_CERT_ID;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${credentials}`
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        success: false,
        error: data.error_description || data.error || 'Token refresh failed'
      };
    }

    return {
      success: true,
      access_token: data.access_token,
      expires_in: data.expires_in,
      token_type: data.token_type
    };

  } catch (error) {
    console.error('Token refresh error:', error);
    return {
      success: false,
      error: 'Failed to refresh access token'
    };
  }
}