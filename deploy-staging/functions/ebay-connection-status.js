/**
 * eBay Connection Status
 * 
 * Check if user has connected their eBay account
 * Returns connection status without exposing credentials
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { decrypt } = require('./utils/encryption');
const { getValidAccessToken } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
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

    // Get user's eBay connection status (tokens only - app credentials are platform-level)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('ebay_refresh_token, ebay_connection_status, ebay_token_expires_at')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Failed to get user data:', userError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to check connection status' })
      };
    }

    // Determine connection status based on refresh token presence
    const hasRefreshToken = !!userData?.ebay_refresh_token;
    
    let status = 'not_connected';
    let message = 'eBay account not connected';

    if (hasRefreshToken) {
      status = 'connected';
      message = 'eBay account connected';
      
      // Check if token is expired (will auto-refresh on next API call)
      if (userData.ebay_token_expires_at) {
        const expiresAt = new Date(userData.ebay_token_expires_at);
        const now = new Date();
        if (expiresAt < now) {
          status = 'token_expired';
          message = 'eBay token expired - will refresh on next API call';
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: status === 'connected' || status === 'token_expired',
        status: status,
        message: message
      })
    };

  } catch (error) {
    console.error('eBay connection status error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to check connection status' })
    };
  }
};
