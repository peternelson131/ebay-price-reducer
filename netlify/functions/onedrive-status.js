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
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Extract user-friendly path from OneDrive's parentReference.path
 * OneDrive paths look like: "/drive/root:/Documents/Folder"
 * We want to show: "My Files/Documents/Folder"
 */
function extractUserFriendlyPath(parentReferencePath, folderName) {
  if (!parentReferencePath) {
    return 'My Files';
  }

  // Remove the "/drive/root:" prefix
  let cleanPath = parentReferencePath.replace(/^\/drive\/root:?/, '');
  
  // Remove leading slash
  cleanPath = cleanPath.replace(/^\//, '');
  
  // If empty, we're at root
  if (!cleanPath) {
    return folderName; // Just the folder name at root
  }
  
  // Otherwise prepend "My Files" and add folder name
  return `My Files/${cleanPath}/${folderName}`;
}

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
    let folderPath = connection.default_folder_path;
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

      // Auto-fix "Unknown" paths by fetching actual folder metadata
      if (connection.default_folder_id && folderPath && folderPath.includes('Unknown')) {
        try {
          console.log('Detected "Unknown" in folder path, fetching actual path...');
          const folderMetadata = await graphApiRequest(
            userId, 
            `/me/drive/items/${connection.default_folder_id}`
          );
          
          const correctedPath = extractUserFriendlyPath(
            folderMetadata.parentReference?.path,
            folderMetadata.name
          );
          
          console.log(`Correcting path from "${folderPath}" to "${correctedPath}"`);
          
          // Update the database with the corrected path
          await supabase
            .from('user_onedrive_connections')
            .update({
              default_folder_path: correctedPath,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId);
          
          // Use the corrected path in the response
          folderPath = correctedPath;
        } catch (error) {
          console.error('Error auto-fixing folder path:', error);
          // If it fails, just use the existing path
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        connected: true,
        email,
        folderPath,
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
