/**
 * OneDrive Set Folder - Save default upload folder
 * 
 * POST /onedrive-set-folder
 * Body: { folderId: string, folderPath: string }
 * 
 * Saves the user's default folder for video uploads
 * Validates that the folder exists and is accessible
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Verify folder exists and is accessible
 */
async function verifyFolderAccess(userId, folderId) {
  try {
    const response = await graphApiRequest(userId, `/me/drive/items/${folderId}`);
    
    // Check if it's actually a folder
    if (!response.folder) {
      throw new Error('The specified item is not a folder');
    }
    
    return {
      valid: true,
      name: response.name,
      path: response.parentReference?.path || '/'
    };
  } catch (error) {
    console.error('Folder verification failed:', error);
    return {
      valid: false,
      error: error.message
    };
  }
}

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

    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON in request body' })
      };
    }

    const { folderId, folderPath } = body;

    // Validate required fields
    if (!folderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'folderId is required' })
      };
    }

    if (!folderPath) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'folderPath is required' })
      };
    }

    // Verify folder exists and is accessible
    const verification = await verifyFolderAccess(userId, folderId);
    
    if (!verification.valid) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Cannot access the specified folder',
          details: verification.error
        })
      };
    }

    // Update user's default folder setting
    const { error: updateError } = await supabase
      .from('user_onedrive_connections')
      .update({
        default_folder_id: folderId,
        default_folder_path: folderPath,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (updateError) {
      console.error('Error updating default folder:', updateError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to save folder setting' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Default folder updated',
        folder: {
          id: folderId,
          path: folderPath,
          name: verification.name
        }
      })
    };

  } catch (error) {
    console.error('OneDrive set folder error:', error);
    
    let userMessage = 'Failed to save folder setting';
    if (error.message.includes('not connected')) {
      userMessage = 'OneDrive not connected. Please connect your account first.';
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: userMessage,
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    };
  }
};
