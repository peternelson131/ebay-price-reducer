/**
 * TikTok OAuth Callback Handler
 * GET /.netlify/functions/tiktok-callback?code=xxx&state=xxx
 * 
 * Exchanges authorization code for access/refresh tokens
 * Gets TikTok user info and stores encrypted tokens
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken } = require('./utils/social-token-encryption');
const fetch = require('node-fetch');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code from TikTok
 * @returns {Object} Token data
 */
async function exchangeCodeForTokens(code) {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  
  const tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
  
  const params = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    code: code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  });
  
  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cache-Control': 'no-cache'
    },
    body: params.toString()
  });
  
  const data = await response.json();
  
  if (!response.ok || data.error) {
    console.error('TikTok token exchange error:', data);
    throw new Error(data.error_description || data.message || 'Token exchange failed');
  }
  
  return data;
}

/**
 * Get TikTok user info
 * @param {string} accessToken - Access token
 * @returns {Object} User info
 */
async function getUserInfo(accessToken) {
  const response = await fetch('https://open.tiktokapis.com/v2/user/info/', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  const data = await response.json();
  
  if (!response.ok || data.error) {
    console.error('TikTok user info error:', data);
    throw new Error(data.error?.message || 'Failed to get user info');
  }
  
  return data.data?.user || {};
}

/**
 * Generate redirect response
 */
function generateRedirectResponse(success, errorMessage = null) {
  const baseUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
  const status = success ? 'connected' : 'error';
  const errorParam = errorMessage ? `&error=${encodeURIComponent(errorMessage)}` : '';
  const redirectUrl = `${baseUrl}/integrations?social=${status}&platform=tiktok${errorParam}`;
  
  return {
    statusCode: 302,
    headers: {
      'Location': redirectUrl,
      'Cache-Control': 'no-cache'
    },
    body: ''
  };
}

exports.handler = async (event, context) => {
  try {
    const { code, state, error: oauthError, error_description } = event.queryStringParameters || {};
    
    // Check for OAuth errors
    if (oauthError) {
      console.error('TikTok OAuth error:', oauthError, error_description);
      return generateRedirectResponse(false, `OAuth error: ${error_description || oauthError}`);
    }
    
    // Validate required parameters
    if (!code || !state) {
      return generateRedirectResponse(false, 'Missing authorization code or state');
    }
    
    // Verify state and get user info
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('user_id, provider, expires_at')
      .eq('state', state)
      .eq('provider', 'tiktok')
      .single();
    
    if (stateError || !stateData) {
      console.error('Invalid state:', stateError);
      return generateRedirectResponse(false, 'Invalid or expired state parameter');
    }
    
    // Check expiration
    if (new Date(stateData.expires_at) < new Date()) {
      return generateRedirectResponse(false, 'OAuth state expired');
    }
    
    const userId = stateData.user_id;
    
    // Exchange code for tokens
    console.log('Exchanging code for tokens...');
    const tokenData = await exchangeCodeForTokens(code);
    
    if (!tokenData.access_token) {
      return generateRedirectResponse(false, 'Failed to obtain access token');
    }
    
    // Get user info
    console.log('Getting TikTok user info...');
    const userInfo = await getUserInfo(tokenData.access_token);
    
    const username = userInfo.display_name || userInfo.username || 'TikTok User';
    const accountId = tokenData.open_id; // TikTok uses open_id as unique identifier
    
    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token 
      ? encryptToken(tokenData.refresh_token) 
      : null;
    
    // Calculate token expiration
    // TikTok access tokens expire in 24 hours (86400 seconds)
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : new Date(Date.now() + 86400 * 1000).toISOString(); // Default 24 hours
    
    // Store account in database
    const { data: account, error: insertError } = await supabase
      .from('social_accounts')
      .upsert({
        user_id: userId,
        platform: 'tiktok',
        username: username,
        account_id: accountId,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        account_metadata: {
          display_name: userInfo.display_name,
          profile_image: userInfo.avatar_url,
          follower_count: userInfo.follower_count,
          video_count: userInfo.video_count
        },
        is_active: true,
        connected_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,account_id',
        returning: 'minimal'
      });
    
    if (insertError) {
      console.error('Error storing TikTok account:', insertError);
      return generateRedirectResponse(false, 'Failed to store account connection');
    }
    
    // Delete used state
    await supabase.from('oauth_states').delete().eq('state', state);
    
    console.log(`TikTok account connected for user ${userId}: ${username}`);
    
    // Success!
    return generateRedirectResponse(true);
    
  } catch (error) {
    console.error('Unexpected error in tiktok-callback:', error);
    return generateRedirectResponse(false, error.message || 'Internal server error');
  }
};
