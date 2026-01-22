/**
 * Instagram OAuth Callback - Handle Instagram's response
 * GET /instagram-callback - Exchanges code for tokens, stores connection
 */

const { createClient } = require('@supabase/supabase-js');

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const INSTAGRAM_REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI || 
  `${process.env.URL || 'https://dainty-horse-49c336.netlify.app'}/.netlify/functions/instagram-callback`;
const FRONTEND_URL = process.env.URL || 'https://dainty-horse-49c336.netlify.app';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  try {
    const { code, state, error: oauthError } = event.queryStringParameters || {};

    // Handle OAuth errors
    if (oauthError) {
      console.error('OAuth error:', oauthError);
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=Missing%20authorization%20code`);
    }

    // Decode state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=Invalid%20state`);
    }

    const { userId } = stateData;
    if (!userId) {
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=Invalid%20user`);
    }

    // Step 1: Exchange code for short-lived access token
    const tokenParams = new URLSearchParams({
      client_id: META_APP_ID,
      client_secret: META_APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: INSTAGRAM_REDIRECT_URI,
      code: code
    });

    const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    const tokenData = await tokenResponse.json();
    
    if (tokenData.error_type || tokenData.error_message) {
      console.error('Token exchange error:', tokenData);
      const errorMsg = tokenData.error_message || tokenData.error_type || 'Token exchange failed';
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=${encodeURIComponent(errorMsg)}`);
    }

    const shortLivedToken = tokenData.access_token;
    const instagramUserId = tokenData.user_id;

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = new URL('https://graph.instagram.com/access_token');
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
    longLivedUrl.searchParams.set('access_token', shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('Long-lived token error:', longLivedData);
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=${encodeURIComponent(longLivedData.error.message)}`);
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // Default to 60 days if not provided
    const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));

    // Step 3: Get Instagram user profile
    const profileUrl = new URL(`https://graph.instagram.com/${instagramUserId}`);
    profileUrl.searchParams.set('fields', 'id,username,account_type');
    profileUrl.searchParams.set('access_token', accessToken);

    const profileResponse = await fetch(profileUrl.toString());
    const profileData = await profileResponse.json();

    if (profileData.error) {
      console.error('Profile fetch error:', profileData);
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=${encodeURIComponent(profileData.error.message)}`);
    }

    const username = profileData.username;
    const accountType = profileData.account_type;

    // Verify it's a business account
    if (accountType !== 'BUSINESS') {
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=Only%20Instagram%20Business%20accounts%20are%20supported`);
    }

    // Step 4: Store connection in database
    const { error: dbError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        platform: 'instagram',
        access_token: accessToken,
        refresh_token: null, // Instagram doesn't use refresh tokens
        token_expires_at: tokenExpiresAt.toISOString(),
        account_id: instagramUserId,
        account_name: username,
        account_avatar: null,
        connected_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=Failed%20to%20save%20connection`);
    }

    // Create default posting schedule if not exists
    await supabase
      .from('posting_schedules')
      .upsert({
        user_id: userId,
        platform: 'instagram',
        post_time: '10:00',
        timezone: 'America/Chicago',
        is_active: false, // Start disabled, user enables when ready
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    // Success - redirect back to integrations
    return redirect(`${FRONTEND_URL}/integrations?instagram=connected&account=${encodeURIComponent(username)}`);

  } catch (error) {
    console.error('Instagram callback error:', error);
    console.error('Error stack:', error.stack);
    const errorMsg = error.message || 'Unexpected error';
    return redirect(`${FRONTEND_URL}/integrations?instagram=error&message=${encodeURIComponent(errorMsg)}`);
  }
};

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: ''
  };
}
