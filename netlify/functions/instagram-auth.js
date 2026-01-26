/**
 * Instagram OAuth - Initiate authentication flow
 * GET /instagram-auth - Redirects to Instagram OAuth
 */

const { getCorsHeaders, handlePreflight, errorResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { applyRateLimit } = require('./utils/rate-limit');

const META_APP_ID = process.env.META_APP_ID;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 
  `${process.env.URL || 'https://dainty-horse-49c336.netlify.app'}/.netlify/functions/instagram-callback`;

// Scopes needed for Instagram API with Instagram Login
const SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish'
].join(',');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Verify user is authenticated
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;
    
    // Apply rate limiting (SECURITY FIX)
    const rateLimitResult = applyRateLimit(event, userId, 'auth');
    if (rateLimitResult && !rateLimitResult.allowed) {
      return rateLimitResult;
    }
    if (rateLimitResult && rateLimitResult.headers) {
      Object.assign(headers, rateLimitResult.headers);
    }

    // Generate state parameter with user ID (for callback verification)
    const state = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now()
    })).toString('base64');

    // Build Instagram OAuth URL (using Instagram Login, not Facebook Login)
    const authUrl = new URL('https://www.instagram.com/oauth/authorize');
    authUrl.searchParams.set('client_id', META_APP_ID);
    authUrl.searchParams.set('redirect_uri', INSTAGRAM_REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);

    // Return the auth URL for frontend to redirect
    return {
      statusCode: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        authUrl: authUrl.toString()
      })
    };

  } catch (error) {
    console.error('Instagram auth error:', error);
    return errorResponse(500, 'Failed to initiate Instagram authentication', headers);
  }
};
