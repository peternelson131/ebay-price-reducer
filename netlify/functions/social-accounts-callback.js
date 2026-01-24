/**
 * OAuth Callback Handler for Social Media Connections
 * GET /.netlify/functions/social-accounts-callback?code=xxx&state=xxx
 * 
 * Exchanges authorization code for access/refresh tokens and stores them encrypted.
 * Returns HTML page that closes popup and notifies parent window.
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken } = require('./utils/social-token-encryption');
const fetch = require('node-fetch');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// OAuth Token Exchange Configuration
const TOKEN_CONFIG = {
  instagram: {
    // Instagram Graph API uses Facebook OAuth token endpoint
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    clientId: process.env.META_APP_ID,
    clientSecret: process.env.META_APP_SECRET,
    grantType: 'authorization_code'
  },
  youtube: {
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    grantType: 'authorization_code'
  },
  tiktok: {
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    grantType: 'authorization_code'
  }
};

/**
 * Fetch account info from platform API
 */
async function getAccountInfo(platform, accessToken, tokenData = {}) {
  if (platform === 'instagram') {
    // Instagram Graph API: Get Instagram account via Facebook Pages
    // Step 1: Get user's Facebook Pages
    const pagesResponse = await fetch(
      `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json();
    console.log('Facebook Pages:', JSON.stringify(pagesData));
    
    // Find a page with Instagram Business Account
    const pageWithInstagram = pagesData.data?.find(p => p.instagram_business_account);
    
    if (!pageWithInstagram || !pageWithInstagram.instagram_business_account) {
      throw new Error('No Instagram Business Account found. Make sure your Instagram is linked to a Facebook Page.');
    }
    
    const igAccountId = pageWithInstagram.instagram_business_account.id;
    
    // Step 2: Get Instagram account details
    const igResponse = await fetch(
      `https://graph.facebook.com/v18.0/${igAccountId}?fields=id,username,profile_picture_url,followers_count&access_token=${accessToken}`
    );
    const igData = await igResponse.json();
    console.log('Instagram Account:', JSON.stringify(igData));
    
    return {
      accountId: igData.id,
      username: igData.username || `ig_${igData.id}`,
      metadata: { 
        profilePicture: igData.profile_picture_url,
        followers: igData.followers_count,
        facebookPageId: pageWithInstagram.id,
        facebookPageName: pageWithInstagram.name
      }
    };
  } else if (platform === 'youtube') {
    // Get YouTube channel info
    const response = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );
    const data = await response.json();
    const channel = data.items?.[0];
    return {
      accountId: channel?.id || 'unknown',
      username: channel?.snippet?.title || 'YouTube Channel',
      metadata: {
        customUrl: channel?.snippet?.customUrl,
        thumbnail: channel?.snippet?.thumbnails?.default?.url
      }
    };
  } else if (platform === 'tiktok') {
    // Get TikTok user info
    const response = await fetch('https://open.tiktokapis.com/v2/user/info/', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();
    const userInfo = data.data?.user || {};
    
    return {
      accountId: tokenData.open_id || 'unknown', // TikTok uses open_id
      username: userInfo.display_name || userInfo.username || 'TikTok User',
      metadata: {
        display_name: userInfo.display_name,
        profile_image: userInfo.avatar_url,
        follower_count: userInfo.follower_count,
        video_count: userInfo.video_count
      }
    };
  }
  
  return {
    accountId: 'unknown',
    username: 'User',
    metadata: {}
  };
}

/**
 * Generate HTML response for popup
 */
function generatePopupResponse(success, data = {}) {
  // Redirect to integrations page with status
  const baseUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
  const status = success ? 'connected' : 'error';
  const errorMsg = data.error ? `&error=${encodeURIComponent(data.error)}` : '';
  const redirectUrl = `${baseUrl}/integrations?social=${status}${errorMsg}`;
  
  return {
    statusCode: 302,
    headers: {
      'Location': redirectUrl,
      'Cache-Control': 'no-cache'
    },
    body: ''
  };

  // OLD POPUP CODE - kept for reference
  /*
  const message = success ? 'success' : 'error';
  const payload = JSON.stringify(data);
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html' },
    body: `
<!DOCTYPE html>
<html>
<head>
  <title>Social Account Connection</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: ${success ? '#f0f9ff' : '#fef2f2'};
    }
    .message {
      text-align: center;
      padding: 2rem;
    }
    .icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }
    h1 {
      font-size: 1.5rem;
      margin: 0 0 0.5rem;
      color: ${success ? '#0369a1' : '#dc2626'};
    }
    p {
      color: #64748b;
      margin: 0;
    }
  </style>
</head>
<body>
  <div class="message">
    <div class="icon">${success ? '✅' : '❌'}</div>
    <h1>${success ? 'Account Connected!' : 'Connection Failed'}</h1>
    <p>${success ? 'You can close this window now.' : data.error || 'Something went wrong.'}</p>
  </div>
  <script>
    // Notify parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'social-oauth-${message}',
        data: ${payload}
      }, '*');
    }
    
    // Auto-close after 2 seconds
    setTimeout(() => {
      window.close();
    }, 2000);
  </script>
</body>
</html>
    `
  };
  */
}

exports.handler = async (event, context) => {
  try {
    const { code, state, error: oauthError } = event.queryStringParameters || {};
    
    // Check for OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return generatePopupResponse(false, { error: `OAuth error: ${oauthError}` });
    }
    
    // Validate required parameters
    if (!code || !state) {
      return generatePopupResponse(false, { error: 'Missing authorization code or state' });
    }
    
    // Verify state and get user/platform
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: stateData, error: stateError } = await supabase
      .from('oauth_states')
      .select('user_id, provider, expires_at')
      .eq('state', state)
      .single();
    
    if (stateError || !stateData) {
      console.error('Invalid state:', stateError);
      return generatePopupResponse(false, { error: 'Invalid or expired state parameter' });
    }
    
    // Check expiration
    if (new Date(stateData.expires_at) < new Date()) {
      return generatePopupResponse(false, { error: 'OAuth state expired' });
    }
    
    const { user_id: userId, provider: platform } = stateData;
    const config = TOKEN_CONFIG[platform];
    
    if (!config) {
      return generatePopupResponse(false, { error: `Unsupported platform: ${platform}` });
    }
    
    // Build callback URL
    const baseUrl = process.env.URL || `https://${event.headers.host}`;
    const redirectUri = `${baseUrl}/.netlify/functions/social-accounts-callback`;
    
    // Exchange code for tokens
    const tokenParams = new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: config.grantType
    });
    
    const tokenResponse = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString()
    });
    
    const tokenData = await tokenResponse.json();
    
    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return generatePopupResponse(false, { 
        error: tokenData.error_description || 'Failed to obtain access token' 
      });
    }
    
    // Get account info
    const accountInfo = await getAccountInfo(platform, tokenData.access_token, tokenData);
    
    // Encrypt tokens
    const encryptedAccessToken = encryptToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token 
      ? encryptToken(tokenData.refresh_token) 
      : null;
    
    // Calculate token expiration
    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;
    
    // Store account in database
    const { data: account, error: insertError } = await supabase
      .from('social_accounts')
      .upsert({
        user_id: userId,
        platform,
        username: accountInfo.username,
        account_id: accountInfo.accountId,
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        account_metadata: accountInfo.metadata,
        is_active: true,
        connected_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform,account_id',
        returning: 'minimal'
      });
    
    if (insertError) {
      console.error('Error storing account:', insertError);
      return generatePopupResponse(false, { error: 'Failed to store account connection' });
    }
    
    // Delete used state
    await supabase.from('oauth_states').delete().eq('state', state);
    
    // Success!
    return generatePopupResponse(true, {
      platform,
      username: accountInfo.username
    });
    
  } catch (error) {
    console.error('Unexpected error in callback:', error);
    return generatePopupResponse(false, { error: 'Internal server error' });
  }
};
