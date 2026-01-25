/**
 * YouTube OAuth Callback - Handle Google's response
 * GET /youtube-callback - Exchanges code for tokens, stores connection
 */

const { createClient } = require('@supabase/supabase-js');

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 
  `${process.env.URL}/.netlify/functions/youtube-callback`;
const FRONTEND_URL = process.env.URL;

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
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=Missing%20authorization%20code`);
    }

    // Decode state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=Invalid%20state`);
    }

    const { userId } = stateData;
    if (!userId) {
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=Invalid%20user`);
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: GOOGLE_REDIRECT_URI
      })
    });

    const tokens = await tokenResponse.json();
    
    if (tokens.error) {
      console.error('Token exchange error:', tokens);
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=${encodeURIComponent(tokens.error_description || tokens.error)}`);
    }

    const { access_token, refresh_token, expires_in } = tokens;
    const tokenExpiresAt = new Date(Date.now() + (expires_in * 1000));

    // Get YouTube channel info
    const channelResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    
    const channelData = await channelResponse.json();
    
    if (!channelData.items || channelData.items.length === 0) {
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=No%20YouTube%20channel%20found`);
    }

    const channel = channelData.items[0];
    const channelId = channel.id;
    const channelName = channel.snippet.title;
    const channelAvatar = channel.snippet.thumbnails?.default?.url;

    // Store/update connection in database
    const { error: dbError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        platform: 'youtube',
        access_token,
        refresh_token,
        token_expires_at: tokenExpiresAt.toISOString(),
        account_id: channelId,
        account_name: channelName,
        account_avatar: channelAvatar,
        connected_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=Failed%20to%20save%20connection`);
    }

    // Create default posting schedule if not exists
    await supabase
      .from('posting_schedules')
      .upsert({
        user_id: userId,
        platform: 'youtube',
        post_time: '09:00',
        timezone: 'America/Chicago',
        is_active: false, // Start disabled, user enables when ready
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    // Success - redirect back to integrations
    return redirect(`${FRONTEND_URL}/integrations?youtube=connected&channel=${encodeURIComponent(channelName)}`);

  } catch (error) {
    console.error('YouTube callback error:', error);
    return redirect(`${FRONTEND_URL}/integrations?youtube=error&message=Unexpected%20error`);
  }
};

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: ''
  };
}
