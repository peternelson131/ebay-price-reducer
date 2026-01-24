/**
 * Initiate TikTok OAuth Connection
 * POST /.netlify/functions/tiktok-connect
 * 
 * Generates OAuth authorization URL for TikTok Content Posting API
 * Stores state for CSRF protection
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    // Check for required environment variables
    const clientKey = process.env.TIKTOK_CLIENT_KEY;
    const redirectUri = process.env.TIKTOK_REDIRECT_URI;
    
    if (!clientKey) {
      console.error('Missing TIKTOK_CLIENT_KEY');
      return errorResponse(500, 'TikTok OAuth not configured', headers);
    }
    
    if (!redirectUri) {
      console.error('Missing TIKTOK_REDIRECT_URI');
      return errorResponse(500, 'TikTok redirect URI not configured', headers);
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
        provider: 'tiktok',
        expires_at: expiresAt.toISOString()
      });
    
    if (stateError) {
      console.error('Error storing OAuth state:', stateError);
      return errorResponse(500, 'Failed to initiate OAuth flow', headers);
    }
    
    // Build authorization URL
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.append('client_key', clientKey);
    authUrl.searchParams.append('response_type', 'code');
    authUrl.searchParams.append('scope', 'user.info.basic,video.upload,video.publish');
    authUrl.searchParams.append('redirect_uri', redirectUri);
    authUrl.searchParams.append('state', state);
    
    console.log('TikTok OAuth URL generated for user:', userId);
    
    return successResponse({
      authUrl: authUrl.toString(),
      platform: 'tiktok',
      state
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in tiktok-connect:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
