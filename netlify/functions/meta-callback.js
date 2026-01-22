/**
 * Meta (Facebook/Instagram) OAuth Callback - Handle Facebook's response
 * GET /meta-callback - Exchanges code for tokens, stores connection
 */

const { createClient } = require('@supabase/supabase-js');

const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const META_REDIRECT_URI = process.env.META_REDIRECT_URI || 
  `${process.env.URL || 'https://dainty-horse-49c336.netlify.app'}/.netlify/functions/meta-callback`;
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
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=${encodeURIComponent(oauthError)}`);
    }

    if (!code || !state) {
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=Missing%20authorization%20code`);
    }

    // Decode state to get user ID
    let stateData;
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=Invalid%20state`);
    }

    const { userId } = stateData;
    if (!userId) {
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=Invalid%20user`);
    }

    // Step 1: Exchange code for short-lived access token
    const tokenUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    tokenUrl.searchParams.set('client_id', META_APP_ID);
    tokenUrl.searchParams.set('client_secret', META_APP_SECRET);
    tokenUrl.searchParams.set('redirect_uri', META_REDIRECT_URI);
    tokenUrl.searchParams.set('code', code);

    const tokenResponse = await fetch(tokenUrl.toString());
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=${encodeURIComponent(tokenData.error.message)}`);
    }

    const shortLivedToken = tokenData.access_token;

    // Step 2: Exchange short-lived token for long-lived token (60 days)
    const longLivedUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', META_APP_ID);
    longLivedUrl.searchParams.set('client_secret', META_APP_SECRET);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedToken);

    const longLivedResponse = await fetch(longLivedUrl.toString());
    const longLivedData = await longLivedResponse.json();

    if (longLivedData.error) {
      console.error('Long-lived token error:', longLivedData);
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=${encodeURIComponent(longLivedData.error.message)}`);
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in; // seconds, ~60 days
    const tokenExpiresAt = new Date(Date.now() + (expiresIn * 1000));

    // Step 3: Get user's Facebook Pages
    const pagesUrl = new URL('https://graph.facebook.com/v18.0/me/accounts');
    pagesUrl.searchParams.set('access_token', accessToken);
    pagesUrl.searchParams.set('fields', 'id,name,access_token,instagram_business_account');

    const pagesResponse = await fetch(pagesUrl.toString());
    const pagesData = await pagesResponse.json();

    if (pagesData.error) {
      console.error('Pages fetch error:', pagesData);
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=${encodeURIComponent(pagesData.error.message)}`);
    }

    if (!pagesData.data || pagesData.data.length === 0) {
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=No%20Facebook%20Pages%20found`);
    }

    // Use the first page (users typically have one business page)
    // TODO: In the future, we could let users select which page to connect
    const page = pagesData.data[0];
    const pageId = page.id;
    const pageName = page.name;
    const pageAccessToken = page.access_token; // Page-specific token

    // Step 4: Check if page has connected Instagram Business Account
    let instagramId = null;
    let instagramUsername = null;

    if (page.instagram_business_account) {
      const igAccountId = page.instagram_business_account.id;
      
      // Fetch Instagram account details
      const igUrl = new URL(`https://graph.facebook.com/v18.0/${igAccountId}`);
      igUrl.searchParams.set('access_token', pageAccessToken);
      igUrl.searchParams.set('fields', 'id,username');

      const igResponse = await fetch(igUrl.toString());
      const igData = await igResponse.json();

      if (!igData.error) {
        instagramId = igData.id;
        instagramUsername = igData.username;
      } else {
        console.warn('Instagram account fetch error:', igData.error);
      }
    }

    // Step 5: Store connection in database
    // Use page access token as it's better for long-term API access
    const { error: dbError } = await supabase
      .from('social_connections')
      .upsert({
        user_id: userId,
        platform: 'meta',
        access_token: pageAccessToken, // Use page token for API calls
        refresh_token: null, // Meta doesn't use refresh tokens, just long-lived tokens
        token_expires_at: tokenExpiresAt.toISOString(),
        account_id: pageId,
        account_name: pageName,
        account_avatar: null, // Could fetch page profile picture if needed
        instagram_account_id: instagramId,
        instagram_username: instagramUsername,
        connected_at: new Date().toISOString(),
        is_active: true,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    if (dbError) {
      console.error('Database error:', dbError);
      return redirect(`${FRONTEND_URL}/integrations?meta=error&message=Failed%20to%20save%20connection`);
    }

    // Create default posting schedule if not exists
    await supabase
      .from('posting_schedules')
      .upsert({
        user_id: userId,
        platform: 'meta',
        post_time: '09:00',
        timezone: 'America/Chicago',
        is_active: false, // Start disabled, user enables when ready
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,platform'
      });

    // Success - redirect back to integrations
    const connectedAccounts = instagramUsername 
      ? `${pageName} + @${instagramUsername}`
      : pageName;
    
    return redirect(`${FRONTEND_URL}/integrations?meta=connected&account=${encodeURIComponent(connectedAccounts)}`);

  } catch (error) {
    console.error('Meta callback error:', error);
    return redirect(`${FRONTEND_URL}/integrations?meta=error&message=Unexpected%20error`);
  }
};

function redirect(url) {
  return {
    statusCode: 302,
    headers: { Location: url },
    body: ''
  };
}
