const crypto = require('crypto');

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Encryption helpers for refresh token
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex').slice(0, 32);
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
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

      // Return eBay OAuth URL
      const ebayAuthUrl = `https://auth.ebay.com/oauth2/authorize?` +
        `client_id=${process.env.EBAY_APP_ID}&` +
        `response_type=code&` +
        `redirect_uri=${encodeURIComponent(process.env.EBAY_REDIRECT_URI)}&` +
        `scope=${encodeURIComponent('https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly')}&` +
        `state=${oauthState}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          authUrl: ebayAuthUrl,
          state: oauthState
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

      // Delete used state (use service key for protected table)
      await supabaseRequest(
        `oauth_states?state=eq.${state}`,
        'DELETE',
        null,
        {},
        true // Use service key for protected table
      );

      // Exchange code for tokens
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
          'Authorization': 'Basic ' + Buffer.from(`${process.env.EBAY_APP_ID}:${process.env.EBAY_CERT_ID}`).toString('base64')
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
      // Get user's eBay credentials
      const users = await supabaseRequest(
        `users?id=eq.${authUser.id}`,
        'GET'
      );

      if (!users || users.length === 0) {
        throw new Error('User not found');
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