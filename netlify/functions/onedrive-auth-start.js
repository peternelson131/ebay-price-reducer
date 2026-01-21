/**
 * OneDrive OAuth Start - Generate authorization URL with PKCE
 * 
 * GET /onedrive-auth-start
 * Returns authorization URL for user to visit to connect OneDrive
 * 
 * Uses PKCE (Proof Key for Code Exchange) for enhanced security
 * Stores code_verifier in database for callback verification
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Microsoft OAuth endpoints
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const MICROSOFT_AUTH_URL = `https://login.microsoftonline.com/${MICROSOFT_TENANT}/oauth2/v2.0/authorize`;
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || `${process.env.URL}/.netlify/functions/onedrive-callback`;

// Scopes needed for OneDrive file access
const SCOPES = [
  'Files.ReadWrite',      // Read/write files
  'User.Read',            // Get user profile
  'offline_access'        // Refresh tokens
].join(' ');

/**
 * Generate PKCE code verifier and challenge
 * @returns {Object} - { codeVerifier, codeChallenge }
 */
function generatePKCE() {
  // Code verifier: 43-128 character random string
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  // Code challenge: SHA256 hash of verifier
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  return { codeVerifier, codeChallenge };
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Verify user authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return {
        statusCode: authResult.statusCode,
        headers,
        body: JSON.stringify({ error: authResult.error })
      };
    }

    const userId = authResult.userId;

    // Check configuration
    if (!CLIENT_ID) {
      console.error('MICROSOFT_CLIENT_ID not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'OneDrive integration not configured' })
      };
    }

    // Generate PKCE values
    const { codeVerifier, codeChallenge } = generatePKCE();
    
    // Generate state for CSRF protection
    const state = crypto.randomBytes(16).toString('hex');

    // Store state and code_verifier in database
    const { error: storeError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        user_id: userId,
        provider: 'onedrive',
        code_verifier: codeVerifier,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
      });

    if (storeError) {
      console.error('Error storing OAuth state:', storeError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to initialize OAuth flow' })
      };
    }

    // Build authorization URL
    const authUrl = new URL(MICROSOFT_AUTH_URL);
    authUrl.searchParams.set('client_id', CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    authUrl.searchParams.set('response_mode', 'query');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        authUrl: authUrl.toString(),
        state,
        message: 'Visit this URL to authorize OneDrive access'
      })
    };

  } catch (error) {
    console.error('OneDrive auth start error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
