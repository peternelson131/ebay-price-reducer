/**
 * Initiate Social Media Account Connection (OAuth)
 * POST /.netlify/functions/social-accounts-connect
 * 
 * Body: { platform: 'instagram' | 'youtube' }
 * 
 * Returns OAuth authorization URL for the user to visit.
 * After authorization, user will be redirected to callback URL.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// OAuth Configuration
const OAUTH_CONFIG = {
  instagram: {
    authUrl: 'https://api.instagram.com/oauth/authorize',
    clientId: process.env.META_APP_ID,
    scopes: ['instagram_basic', 'instagram_content_publish'],
    responseType: 'code'
  },
  youtube: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    clientId: process.env.GOOGLE_CLIENT_ID,
    scopes: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'],
    responseType: 'code',
    accessType: 'offline',
    prompt: 'consent' // Force consent to get refresh token
  }
};

const SUPPORTED_PLATFORMS = Object.keys(OAUTH_CONFIG);

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }
  
  const userId = authResult.userId;
  
  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { platform } = body;
    
    // Validate platform
    if (!platform || !SUPPORTED_PLATFORMS.includes(platform)) {
      return errorResponse(400, `Platform must be one of: ${SUPPORTED_PLATFORMS.join(', ')}`, headers);
    }
    
    const config = OAUTH_CONFIG[platform];
    
    // Check for required environment variables
    if (!config.clientId) {
      console.error(`Missing client ID for ${platform}`);
      return errorResponse(500, `${platform} OAuth not configured`, headers);
    }
    
    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in database with expiration (10 minutes)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    const { error: stateError } = await supabase
      .from('oauth_states')
      .insert({
        state,
        user_id: userId,
        platform,
        expires_at: expiresAt.toISOString()
      });
    
    if (stateError) {
      console.error('Error storing OAuth state:', stateError);
      return errorResponse(500, 'Failed to initiate OAuth flow', headers);
    }
    
    // Build callback URL
    const baseUrl = process.env.URL || `https://${event.headers.host}`;
    const redirectUri = `${baseUrl}/.netlify/functions/social-accounts-callback`;
    
    // Build authorization URL
    const authUrl = new URL(config.authUrl);
    authUrl.searchParams.append('client_id', config.clientId);
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);
    authUrl.searchParams.append('response_type', config.responseType);
    authUrl.searchParams.append('scope', config.scopes.join(' '));
    
    // Add platform-specific params
    if (platform === 'youtube') {
      authUrl.searchParams.append('access_type', config.accessType);
      authUrl.searchParams.append('prompt', config.prompt);
    }
    
    return successResponse({
      authorizationUrl: authUrl.toString(),
      platform,
      state
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-accounts-connect:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
