/**
 * Meta (Facebook) OAuth - Initiate authentication flow
 * GET /meta-auth - Redirects to Facebook OAuth
 */

const { getCorsHeaders, handlePreflight, errorResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const META_APP_ID = process.env.META_APP_ID;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 
  `${process.env.URL || 'https://dainty-horse-49c336.netlify.app'}/.netlify/functions/meta-callback`;

// Scopes needed for Facebook Pages only
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts'
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

    // Generate state parameter with user ID (for callback verification)
    const state = Buffer.from(JSON.stringify({
      userId,
      timestamp: Date.now()
    })).toString('base64');

    // Build Facebook OAuth URL
    const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
    authUrl.searchParams.set('client_id', META_APP_ID);
    authUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('auth_type', 'rerequest'); // Force re-request permissions

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
    console.error('Meta auth error:', error);
    return errorResponse(500, 'Failed to initiate Meta authentication', headers);
  }
};
