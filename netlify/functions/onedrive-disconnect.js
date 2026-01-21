/**
 * OneDrive Disconnect
 * 
 * POST /onedrive-disconnect
 * Removes OneDrive connection for authenticated user
 * 
 * Deletes stored tokens and connection settings.
 * Note: Does NOT revoke tokens at Microsoft (user can do that in their account)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

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
    // Verify user authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return {
        statusCode: authResult.statusCode,
        headers,
        body: JSON.stringify({ error: authResult.error })
      };
    }

    const userId = authResult.userId;

    // Delete OneDrive connection
    const { error: deleteError, count } = await supabase
      .from('user_onedrive_connections')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      console.error('Error deleting OneDrive connection:', deleteError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to disconnect OneDrive' })
      };
    }

    // Also delete any orphaned OAuth states
    await supabase
      .from('oauth_states')
      .delete()
      .eq('user_id', userId)
      .eq('provider', 'onedrive');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'OneDrive disconnected successfully',
        deleted: count > 0
      })
    };

  } catch (error) {
    console.error('OneDrive disconnect error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
