/**
 * eBay Disconnect
 * 
 * Remove user's eBay credentials and tokens
 * User will need to reconnect to use eBay features
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Clear user's eBay tokens (app credentials are platform-level, not cleared)
    const { error: updateError } = await supabase
      .from('users')
      .update({
        ebay_access_token: null,
        ebay_refresh_token: null,
        ebay_token_expires_at: null,
        ebay_oauth_state: null,
        ebay_connection_status: null
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to disconnect eBay:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to disconnect eBay account' })
      };
    }

    console.log(`eBay disconnected for user ${user.id}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'eBay account disconnected successfully'
      })
    };

  } catch (error) {
    console.error('eBay disconnect error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to disconnect eBay account' })
    };
  }
};
