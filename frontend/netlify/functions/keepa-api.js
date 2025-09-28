const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Encryption setup
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const IV_LENGTH = 16;

// Helper functions
function encryptApiKey(apiKey) {
  if (!ENCRYPTION_KEY) return apiKey;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(apiKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptApiKey(encryptedKey) {
  if (!ENCRYPTION_KEY || !encryptedKey) return null;
  try {
    const parts = encryptedKey.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error);
    return null;
  }
}

// Get user from token
async function getUserFromToken(token) {
  if (!token) return null;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  return user;
}

// Main handler
exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Get auth token
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'No authentication token provided'
        })
      };
    }

    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);

    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid or expired token'
        })
      };
    }

    // Parse the path to determine the operation
    const path = event.path.replace('/.netlify/functions/keepa-api', '');
    const segments = path.split('/').filter(s => s);

    // Handle different endpoints
    if (segments[0] === 'api-key' && event.httpMethod === 'POST') {
      // Save API key
      const body = JSON.parse(event.body || '{}');
      const { apiKey } = body;

      if (!apiKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'API key is required'
          })
        };
      }

      // Validate API key with Keepa
      try {
        const validateResponse = await fetch(`https://api.keepa.com/token?key=${apiKey}`);
        const validation = await validateResponse.json();

        if (!validation || validation.tokensLeft === undefined) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              success: false,
              message: 'Invalid Keepa API key'
            })
          };
        }

        // Encrypt and save the API key
        const encryptedKey = encryptApiKey(apiKey);

        // Save to user profile
        const { error: updateError } = await supabase
          .from('profiles')
          .update({
            keepa_api_key: encryptedKey,
            keepa_tokens_left: validation.tokensLeft,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id);

        if (updateError) {
          throw updateError;
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'API key saved successfully',
            validation: {
              tokensLeft: validation.tokensLeft
            }
          })
        };
      } catch (error) {
        console.error('Keepa validation error:', error);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            message: 'Failed to validate API key with Keepa'
          })
        };
      }
    }

    if (segments[0] === 'test-connection' && event.httpMethod === 'GET') {
      // Test connection
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('keepa_api_key, keepa_tokens_left')
        .eq('id', user.id)
        .single();

      if (profileError || !profile || !profile.keepa_api_key) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            connected: false,
            message: 'No Keepa API key configured'
          })
        };
      }

      const apiKey = decryptApiKey(profile.keepa_api_key);
      if (!apiKey) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            connected: false,
            message: 'Failed to decrypt API key'
          })
        };
      }

      // Test the API key
      try {
        const response = await fetch(`https://api.keepa.com/token?key=${apiKey}`);
        const data = await response.json();

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            connected: true,
            tokensLeft: data.tokensLeft,
            message: 'Connected to Keepa successfully'
          })
        };
      } catch (error) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: false,
            connected: false,
            message: 'Failed to connect to Keepa'
          })
        };
      }
    }

    // Default response for unhandled routes
    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Endpoint not found'
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        message: 'Internal server error',
        error: error.message
      })
    };
  }
};