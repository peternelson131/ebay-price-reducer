/**
 * OneDrive Connection Status
 * 
 * GET /onedrive-status
 * Returns current OneDrive connection status for authenticated user
 * 
 * Response:
 * {
 *   connected: boolean,
 *   email?: string,
 *   folderPath?: string,
 *   tokenExpiresAt?: string
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { decryptToken } = require('./utils/onedrive-encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Get user email from Microsoft Graph
 */
async function getUserEmail(accessToken) {
  try {
    const response = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      return null;
    }

    const profile = await response.json();
    return profile.userPrincipalName || profile.mail;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

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

    // Check for OneDrive connection
    const { data: connection, error: fetchError } = await supabase
      .from('user_onedrive_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (fetchError || !connection) {
      // No connection found
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          connected: false
        })
      };
    }

    // Connection exists - get user email (if token is still valid)
    let email = null;
    const now = new Date();
    const expiresAt = new Date(connection.token_expires_at);
    
    if (expiresAt > now) {
      // Token still valid - can fetch email
      try {
        const accessToken = decryptToken(connection.access_token_encrypted);
        email = await getUserEmail(accessToken);
      } catch (error) {
        console.error('Error getting user email:', error);
        // Continue anyway - connection still exists
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: true,
        email,
        folderPath: connection.default_folder_path,
        folderId: connection.default_folder_id,
        tokenExpiresAt: connection.token_expires_at,
        tokenExpired: expiresAt <= now
      })
    };

  } catch (error) {
    console.error('OneDrive status error:', error);
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
