/**
 * OneDrive OAuth Callback Handler
 * 
 * GET /onedrive-callback?code=...&state=...
 * Handles OAuth callback from Microsoft
 * - Validates state for CSRF protection
 * - Exchanges authorization code for tokens
 * - Encrypts and stores tokens in database
 * - Redirects user back to app
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken } = require('./utils/onedrive-encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Microsoft OAuth configuration
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const TOKEN_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/token`;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || `${process.env.URL}/.netlify/functions/onedrive-callback`;
const FRONTEND_URL = process.env.FRONTEND_URL || process.env.URL;

/**
 * Exchange authorization code for access/refresh tokens
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    code: code,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier // PKCE verification
  });

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Token exchange failed:', error);
    throw new Error('Failed to exchange code for tokens');
  }

  return await response.json();
}

/**
 * Get user profile from Microsoft Graph
 */
async function getUserProfile(accessToken) {
  const response = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    console.error('Failed to get user profile');
    return null;
  }

  return await response.json();
}

exports.handler = async (event, context) => {
  // No CORS needed - this is a redirect endpoint
  
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: 'Method not allowed'
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const { code, state, error, error_description } = params;

    // Check for OAuth errors
    if (error) {
      console.error('OAuth error:', error, error_description);
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent(error_description || error)}`
        },
        body: ''
      };
    }

    // Validate required parameters
    if (!code || !state) {
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent('Missing authorization code or state')}`
        },
        body: ''
      };
    }

    // Check configuration
    if (!CLIENT_ID || !CLIENT_SECRET) {
      console.error('MICROSOFT_CLIENT_ID or MICROSOFT_CLIENT_SECRET not configured');
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent('Server configuration error')}`
        },
        body: ''
      };
    }

    // Retrieve and validate state from database
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('*')
      .eq('state', state)
      .eq('provider', 'onedrive')
      .single();

    if (stateError || !stateData) {
      console.error('Invalid or expired state:', stateError);
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent('Invalid or expired authorization request')}`
        },
        body: ''
      };
    }

    const userId = stateData.user_id;
    const codeVerifier = stateData.code_verifier;

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, codeVerifier);

    const {
      access_token,
      refresh_token,
      expires_in // seconds until expiration (typically 3600 = 1 hour)
    } = tokenData;

    if (!access_token || !refresh_token) {
      throw new Error('No tokens received from Microsoft');
    }

    // Get user profile (for email display)
    const userProfile = await getUserProfile(access_token);
    const userEmail = userProfile?.userPrincipalName || userProfile?.mail;

    // Encrypt tokens
    const accessTokenEncrypted = encryptToken(access_token);
    const refreshTokenEncrypted = encryptToken(refresh_token);

    // Calculate expiration timestamp
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();

    // Store connection in database (upsert)
    const { error: insertError } = await supabase
      .from('user_onedrive_connections')
      .upsert({
        user_id: userId,
        access_token_encrypted: accessTokenEncrypted,
        refresh_token_encrypted: refreshTokenEncrypted,
        token_expires_at: expiresAt,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (insertError) {
      console.error('Error storing OneDrive connection:', insertError);
      return {
        statusCode: 302,
        headers: {
          Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent('Failed to save connection')}`
        },
        body: ''
      };
    }

    // Clean up used state
    await supabase
      .from('oauth_states')
      .delete()
      .eq('state', state);

    // Redirect back to app with success
    return {
      statusCode: 302,
      headers: {
        Location: `${FRONTEND_URL}/settings?onedrive_connected=true${userEmail ? '&email=' + encodeURIComponent(userEmail) : ''}`
      },
      body: ''
    };

  } catch (error) {
    console.error('OneDrive callback error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `${FRONTEND_URL}/settings?onedrive_error=${encodeURIComponent('Connection failed. Please try again.')}`
      },
      body: ''
    };
  }
};
