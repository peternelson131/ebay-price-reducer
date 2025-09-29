// This function handles the OAuth callback from eBay
// It's a separate function to handle the redirect properly

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
  try {
    console.log('Encrypting refresh token, key length:', ENCRYPTION_KEY.length);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (error) {
    console.error('Encryption error:', error.message);
    console.error('Key buffer length:', ENCRYPTION_KEY.length);
    throw error;
  }
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

exports.handler = async (event, context) => {
  console.log('eBay OAuth Callback handler called');
  console.log('Method:', event.httpMethod);
  console.log('Query params:', event.queryStringParameters);

  const headers = {
    'Content-Type': 'text/html'
  };

  try {
    const { code, state, error: ebayError, error_description } = event.queryStringParameters || {};

    // If eBay returned an error
    if (ebayError) {
      console.error('eBay OAuth error:', ebayError, error_description);
      return {
        statusCode: 200,
        headers,
        body: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>eBay Connection Failed</title>
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 500px; }
              .error { color: #dc2626; font-size: 48px; margin-bottom: 1rem; }
              h1 { color: #1f2937; margin-bottom: 0.5rem; }
              p { color: #6b7280; margin-bottom: 1.5rem; }
              .details { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="error">❌</div>
              <h1>Connection Failed</h1>
              <p>Unable to connect to your eBay account.</p>
              <div class="details">
                <strong>Error:</strong> ${ebayError}<br>
                ${error_description ? `<strong>Details:</strong> ${error_description}` : ''}
              </div>
              <p>This window will close in 5 seconds...</p>
            </div>
            <script>
              // Send message to parent window
              if (window.opener) {
                window.opener.postMessage({
                  type: 'ebay-oauth-error',
                  error: '${ebayError}',
                  message: '${error_description || 'Connection failed'}'
                }, '*');
              }
              // Close window after 5 seconds
              setTimeout(() => window.close(), 5000);
            </script>
          </body>
          </html>
        `
      };
    }

    // Check for required parameters
    if (!code || !state) {
      throw new Error('Missing code or state parameter');
    }

    console.log('Processing OAuth callback with state:', state);

    // Validate state - get the user ID from the state
    // Use service key to bypass RLS policies
    const stateRecords = await supabaseRequest(
      `oauth_states?state=eq.${state}`,
      'GET',
      null,
      {},
      true // Use service key to bypass RLS
    );

    if (!stateRecords || stateRecords.length === 0) {
      throw new Error('Invalid OAuth state - possible CSRF attack');
    }

    const stateRecord = stateRecords[0];
    const userId = stateRecord.user_id;

    console.log('State validated for user:', userId);

    // Delete used state (use service key for protected table)
    await supabaseRequest(
      `oauth_states?state=eq.${state}`,
      'DELETE',
      null,
      {},
      true // Use service key for protected table
    );

    // Get user's eBay credentials for token exchange
    // Use service key to bypass RLS policies
    const users = await supabaseRequest(
      `users?id=eq.${userId}`,
      'GET',
      null,
      {},
      true // Use service key to bypass RLS
    );

    if (!users || users.length === 0) {
      throw new Error('User not found');
    }

    const user = users[0];

    if (!user.ebay_app_id || !user.ebay_cert_id) {
      throw new Error('User eBay credentials not configured');
    }

    // Exchange code for tokens using USER'S credentials
    const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';

    // Use the exact redirect URI that was used in the authorization request
    // Since eBay redirects to /ebay-oauth, use that as the redirect URI
    const redirectUri = process.env.EBAY_REDIRECT_URI || 'https://dainty-horse-49c336.netlify.app/.netlify/functions/ebay-oauth';

    // Don't decode the code - use it as received from eBay
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code, // Use code as-is, eBay handles encoding
      redirect_uri: redirectUri
    });

    console.log('Exchanging code for tokens using user credentials...');
    console.log('Token exchange params:', {
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_length: code.length,
      app_id: user.ebay_app_id
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${user.ebay_app_id}:${user.ebay_cert_id}`).toString('base64')
      },
      body: tokenParams
    });

    const responseText = await tokenResponse.text();
    console.log('Token response status:', tokenResponse.status);

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', responseText);

      // Try to parse error response for better error messages
      let errorMessage = 'Token exchange failed';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.error_description || errorData.error || errorMessage;
      } catch (e) {
        errorMessage = responseText || errorMessage;
      }

      throw new Error(errorMessage);
    }

    const tokenData = JSON.parse(responseText);
    console.log('Token exchange successful');
    console.log('Token data received:', {
      has_access_token: !!tokenData.access_token,
      has_refresh_token: !!tokenData.refresh_token,
      expires_in: tokenData.expires_in,
      token_type: tokenData.token_type
    });

    // Get eBay user info (optional, for display purposes)
    let ebayUserId = null;
    try {
      const userResponse = await fetch('https://api.ebay.com/ws/api.dll', {
        method: 'POST',
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '1167',
          'X-EBAY-API-CALL-NAME': 'GetUser',
          'X-EBAY-API-IAF-TOKEN': tokenData.access_token,
          'Content-Type': 'text/xml'
        },
        body: `<?xml version="1.0" encoding="utf-8"?>
          <GetUserRequest xmlns="urn:ebay:apis:eBLBaseComponents">
            <DetailLevel>ReturnSummary</DetailLevel>
          </GetUserRequest>`
      });

      if (userResponse.ok) {
        const userText = await userResponse.text();
        const userIdMatch = userText.match(/<UserID>([^<]+)<\/UserID>/);
        if (userIdMatch) {
          ebayUserId = userIdMatch[1];
        }
      }
    } catch (e) {
      console.log('Could not fetch eBay user ID:', e);
    }

    // Encrypt and store refresh token
    if (tokenData.refresh_token) {
      const encryptedToken = encrypt(tokenData.refresh_token);

      // Update user record with encrypted refresh token (use service key for protected table)
      await supabaseRequest(
        `users?id=eq.${userId}`,
        'PATCH',
        {
          ebay_refresh_token: encryptedToken,
          ebay_token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          ebay_user_id: ebayUserId
        },
        {},
        true // Use service key for updating users table
      );

      console.log('Refresh token stored successfully');

      // Return success page
      return {
        statusCode: 200,
        headers,
        body: `
          <!DOCTYPE html>
          <html>
          <head>
            <title>eBay Connected Successfully</title>
            <style>
              body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
              .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 500px; }
              .success { color: #10b981; font-size: 48px; margin-bottom: 1rem; }
              h1 { color: #1f2937; margin-bottom: 0.5rem; }
              p { color: #6b7280; margin-bottom: 1.5rem; }
              .user-info { background: #f0fdf4; color: #166534; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="success">✅</div>
              <h1>Successfully Connected!</h1>
              <p>Your eBay account has been connected successfully.</p>
              ${ebayUserId ? `<div class="user-info">Connected as: <strong>${ebayUserId}</strong></div>` : ''}
              <p>You can close this window and return to the application.</p>
            </div>
            <script>
              // Send message to parent window
              if (window.opener) {
                window.opener.postMessage({
                  type: 'ebay-oauth-success',
                  ebayUser: '${ebayUserId || ''}'
                }, '*');
              }
              // Close window after 3 seconds
              setTimeout(() => window.close(), 3000);
            </script>
          </body>
          </html>
        `
      };
    } else {
      throw new Error('No refresh token received from eBay');
    }
  } catch (error) {
    console.error('Error in eBay OAuth callback:', error);

    return {
      statusCode: 200,
      headers,
      body: `
        <!DOCTYPE html>
        <html>
        <head>
          <title>eBay Connection Error</title>
          <style>
            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f5f5f5; }
            .container { text-align: center; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); max-width: 500px; }
            .error { color: #dc2626; font-size: 48px; margin-bottom: 1rem; }
            h1 { color: #1f2937; margin-bottom: 0.5rem; }
            p { color: #6b7280; margin-bottom: 1.5rem; }
            .details { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 4px; margin: 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="error">❌</div>
            <h1>Connection Error</h1>
            <p>An error occurred while connecting to eBay.</p>
            <div class="details">${error.message}</div>
            <p>Please close this window and try again.</p>
          </div>
          <script>
            // Send message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'ebay-oauth-error',
                error: 'Connection failed',
                message: '${error.message.replace(/'/g, "\\'")}'
              }, '*');
            }
            // Close window after 5 seconds
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
        </html>
      `
    };
  }
};