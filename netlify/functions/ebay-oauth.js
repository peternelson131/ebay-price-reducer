const crypto = require('crypto');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Encryption helpers for refresh token
// Ensure we have a proper 32-byte key for AES-256
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    // If env var is set, ensure it's 32 bytes
    const key = process.env.ENCRYPTION_KEY;
    // If it's a hex string, convert it properly
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      return Buffer.from(key, 'hex');
    }
    // Otherwise, hash it to get consistent 32 bytes
    return crypto.createHash('sha256').update(key).digest();
  }
  // Generate a consistent key based on other env vars as fallback
  const seed = process.env.SUPABASE_URL || 'default-seed';
  return crypto.createHash('sha256').update(seed).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}, useServiceKey = false) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  // Use service key for write operations on protected tables
  const apiKey = useServiceKey && SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;

  const options = {
    method,
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status} - ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// Helper function to get authenticated user
async function getAuthUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth failed: No bearer token in header');
    return null;
  }

  const token = authHeader.substring(7);
  console.log('Attempting to validate token with Supabase');

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    console.log('Supabase auth response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('Supabase auth failed:', errorText);
      return null;
    }

    const user = await response.json();
    console.log('User authenticated successfully:', user.id);
    return user;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
}

exports.handler = async (event, context) => {
  console.log('eBay OAuth handler called');
  console.log('Method:', event.httpMethod);
  console.log('Path:', event.path);
  console.log('Query params:', event.queryStringParameters);

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    const { action, code, state } = event.queryStringParameters || {};

    // If we receive a code and state without an action, this is the OAuth callback
    if (code && state && !action) {
      console.log('OAuth callback detected, forwarding to callback handler');
      // Import and call the callback handler directly
      const callbackHandler = require('./ebay-oauth-callback');
      return callbackHandler.handler(event, context);
    }

    // Test endpoint - doesn't require auth
    if (action === 'test') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          message: 'eBay OAuth function is working',
          env: {
            hasSupabaseUrl: !!SUPABASE_URL,
            hasSupabaseKey: !!SUPABASE_ANON_KEY,
            hasEbayAppId: !!process.env.EBAY_APP_ID,
            hasEbayCertId: !!process.env.EBAY_CERT_ID,
            hasEbayRedirectUri: !!process.env.EBAY_REDIRECT_URI,
            hasEncryptionKey: !!process.env.ENCRYPTION_KEY
          },
          timestamp: new Date().toISOString()
        })
      };
    }

    // Check for authenticated user
    // Netlify lowercases headers, so check both
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);
    if (!authUser) {
      console.log('Authentication failed - no valid user found');
      console.log('Headers received:', Object.keys(event.headers));
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Handle different OAuth actions
    if (action === 'initiate') {
      // First, get the user's eBay credentials (use service key to bypass RLS)
      const users = await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'GET',
        null,
        {},
        true // Use service key to bypass RLS policies
      );

      if (!users || users.length === 0) {
        // User record doesn't exist - they need to save credentials first
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'User not found',
            message: 'Please save your eBay credentials first'
          })
        };
      }

      const user = users[0];

      // Check if user has configured their eBay credentials
      if (!user.ebay_app_id || !user.ebay_cert_id) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'eBay credentials not configured',
            message: 'Please configure your eBay App ID and Cert ID first'
          })
        };
      }

      // Generate and store state
      const oauthState = crypto.randomBytes(32).toString('hex');
      console.log('Generated OAuth state:', oauthState);

      // Store state in database with user association (use service key if needed)
      await supabaseRequest(
        'oauth_states',
        'POST',
        {
          state: oauthState,
          user_id: authUser.id,
          created_at: new Date().toISOString()
        },
        {},
        true // Use service key for protected table
      );

      // Return eBay OAuth URL using USER'S credentials, not env vars
      // Use the main ebay-oauth endpoint as redirect URI since eBay sends callback there
      const redirectUri = process.env.EBAY_REDIRECT_URI || 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth';
      const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?` +
        `client_id=${user.ebay_app_id}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly')}&` +
        `state=${oauthState}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authUrl: ebayAuthUrl,
          state: oauthState,
          usingUserCredentials: true
        })
      };
    }

    if (action === 'callback') {
      if (!code || !state) {
        throw new Error('Missing code or state parameter');
      }

      // Validate state
      const stateRecords = await supabaseRequest(
        `oauth_states?state=eq.${state}&user_id=eq.${authUser.id}`,
        'GET'
      );

      if (!stateRecords || stateRecords.length === 0) {
        throw new Error('Invalid OAuth state');
      }

      // Get user's eBay credentials (use service key to bypass RLS)
      const users = await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'GET',
        null,
        {},
        true // Use service key to bypass RLS policies
      );

      if (!users || users.length === 0 || !users[0].ebay_app_id || !users[0].ebay_cert_id) {
        throw new Error('User eBay credentials not configured');
      }

      const user = users[0];

      // Delete used state (use service key for protected table)
      await supabaseRequest(
        `oauth_states?state=eq.${state}`,
        'DELETE',
        null,
        {},
        true // Use service key for protected table
      );

      // Exchange code for tokens using USER'S credentials
      const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
      const decodedCode = decodeURIComponent(code);
      const tokenParams = new URLSearchParams({
        grant_type: 'authorization_code',
        code: decodedCode,
        redirect_uri: process.env.EBAY_REDIRECT_URI
      });

      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
        },
        body: tokenParams
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokenData = await tokenResponse.json();
      console.log('Token exchange successful');

      // Encrypt and store refresh token
      if (tokenData.refresh_token) {
        const encryptedToken = encrypt(tokenData.refresh_token);

        // Update user record with encrypted refresh token (use service key for protected table)
        await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'PATCH',
          {
            ebay_refresh_token: encryptedToken,
            ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          },
          {},
          true // Use service key for protected table
        );

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'eBay account connected successfully',
            hasRefreshToken: true
          })
        };
      } else {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'No refresh token received',
            tokenData: tokenData
          })
        };
      }
    }

    if (action === 'get-credentials') {
      // Get user's eBay credentials (use service key to bypass RLS)
      try {
        const users = await supabaseRequest(
          `users?id=eq.${authUser.id}`,
          'GET',
          null,
          {},
          true // Use service key to bypass RLS policies
        );

        if (!users || users.length === 0) {
          // User not found - return empty credentials
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              hasAppId: false,
              hasCertId: false,
              hasDevId: false,
              hasRefreshToken: false,
              appId: null,
              certId: null,
              devId: null
            })
          };
        }

        const user = users[0];

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            hasAppId: !!user.ebay_app_id,
            hasCertId: !!user.ebay_cert_id,
            hasDevId: !!user.ebay_dev_id,
            hasRefreshToken: !!user.ebay_refresh_token,
            appId: user.ebay_app_id || null,
            certId: user.ebay_cert_id || null,
            devId: user.ebay_dev_id || null
          })
        };
      } catch (error) {
        console.error('Error getting credentials:', error);
        // Return empty credentials on error
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            hasAppId: false,
            hasCertId: false,
            hasDevId: false,
            hasRefreshToken: false,
            appId: null,
            certId: null,
            devId: null,
            error: error.message
          })
        };
      }
    }

    if (action === 'disconnect') {
      console.log('Disconnect action triggered for user:', authUser.id);
      // Disconnect eBay - remove OAuth tokens but keep credentials
      try {
        console.log('Fetching user record to verify existence');
        const users = await supabaseRequest(
          `users?id=eq.${authUser.id}&select=*`,
          'GET',
          null,
          {},
          true // Use service key
        );

        console.log('Users found:', users ? users.length : 0);

        if (!users || users.length === 0) {
          console.error('User not found in database:', authUser.id);
          return {
            statusCode: 404,
            headers,
            body: JSON.stringify({
              error: 'User not found'
            })
          };
        }

        const currentUser = users[0];
        console.log('Current user has refresh token:', !!currentUser.ebay_refresh_token);
        console.log('Current user eBay user ID:', currentUser.ebay_user_id);
        console.log('Current token expiry:', currentUser.ebay_token_expires_at);

        // Clear only OAuth-related fields, keep app credentials
        // Use empty string instead of null for better REST API compatibility
        console.log('Clearing OAuth fields for user:', authUser.id);

        // First approach: Try with nulls
        let updateResult;
        try {
          updateResult = await supabaseRequest(
            `users?id=eq.${authUser.id}&select=*`,
            'PATCH',
            {
              ebay_refresh_token: null,
              ebay_token_expires_at: null,
              ebay_user_id: null
              // Keep: ebay_app_id, ebay_cert_id, ebay_dev_id
            },
            {
              'Prefer': 'return=representation'
            },
            true // Use service key
          );
        } catch (nullError) {
          console.log('Null update failed, trying with empty strings:', nullError.message);
          // Fallback: Try with empty strings if null doesn't work
          updateResult = await supabaseRequest(
            `users?id=eq.${authUser.id}&select=*`,
            'PATCH',
            {
              ebay_refresh_token: '',
              ebay_token_expires_at: null,
              ebay_user_id: ''
              // Keep: ebay_app_id, ebay_cert_id, ebay_dev_id
            },
            {
              'Prefer': 'return=representation'
            },
            true // Use service key
          );
        }

        console.log('Update result:', updateResult);

        // Verify the update worked
        if (updateResult && updateResult.length > 0) {
          const updatedUser = updateResult[0];
          console.log('After update - refresh token cleared:', !updatedUser.ebay_refresh_token);
          console.log('After update - user ID cleared:', !updatedUser.ebay_user_id);
          console.log('After update - expiry cleared:', !updatedUser.ebay_token_expires_at);
          console.log('After update - app_id preserved:', !!updatedUser.ebay_app_id);
          console.log('After update - cert_id preserved:', !!updatedUser.ebay_cert_id);
        }

        // Double-check by fetching again
        const verifyUsers = await supabaseRequest(
          `users?id=eq.${authUser.id}&select=ebay_refresh_token,ebay_user_id,ebay_token_expires_at`,
          'GET',
          null,
          {},
          true
        );

        if (verifyUsers && verifyUsers.length > 0) {
          const verifiedUser = verifyUsers[0];
          console.log('Verification - refresh token is null/empty:', !verifiedUser.ebay_refresh_token);
          console.log('Verification - user ID is null/empty:', !verifiedUser.ebay_user_id);
          console.log('Verification - expiry is null:', !verifiedUser.ebay_token_expires_at);
        }

        console.log('eBay OAuth disconnected successfully for user:', authUser.id);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'eBay account disconnected successfully',
            cleared: {
              refreshToken: true,
              userId: true,
              expiresAt: true
            }
          })
        };
      } catch (error) {
        console.error('Error disconnecting eBay:', error);
        console.error('Error stack:', error.stack);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Failed to disconnect eBay account',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
          })
        };
      }
    }

    // Default response
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };
  } catch (error) {
    console.error('Error in eBay OAuth handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};