/**
 * OneDrive Upload Session - Create resumable upload
 * 
 * POST /onedrive-upload-session
 * Body: {
 *   filename: string,
 *   fileSize: number,
 *   productId?: string,
 *   folderId?: string  // Optional: override default folder
 * }
 * 
 * Creates a resumable upload session via Microsoft Graph
 * For large files (100MB-1GB+), client uploads directly to OneDrive
 * 
 * Returns: {
 *   uploadUrl: string,          // URL for client to upload to
 *   expirationDateTime: string, // When upload session expires
 *   sessionId: string           // Track session in our DB
 * }
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
 * Create upload session via Microsoft Graph
 */
async function createUploadSession(userId, folderId, filename) {
  const endpoint = `/me/drive/items/${folderId}:/${filename}:/createUploadSession`;
  
  const body = {
    item: {
      '@microsoft.graph.conflictBehavior': 'rename', // Auto-rename if file exists
      name: filename
    }
  };

  return await graphApiRequest(userId, endpoint, {
    method: 'POST',
    body: JSON.stringify(body)
  });
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

    const { filename, fileSize, productId, folderId } = body;

    // Validate required fields
    if (!filename) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'filename is required' })
      };
    }

    if (!fileSize || fileSize <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'fileSize is required and must be > 0' })
      };
    }

    // Get user's OneDrive connection for default folder
    const { data: connection, error: connError } = await supabase
      .from('user_onedrive_connections')
      .select('default_folder_id')
      .eq('user_id', userId)
      .single();

    if (connError || !connection) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'OneDrive not connected' })
      };
    }

    // Use provided folder or default
    const targetFolderId = folderId || connection.default_folder_id;

    if (!targetFolderId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'No folder specified. Please set a default folder or provide folderId.' 
        })
      };
    }

    // Validate productId if provided
    if (productId) {
      const { data: product, error: productError } = await supabase
        .from('sourced_products')
        .select('id')
        .eq('id', productId)
        .eq('user_id', userId)
        .single();

      if (productError || !product) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid productId or product does not belong to user' })
        };
      }
    }

    // Create upload session with Microsoft
    const sessionData = await createUploadSession(userId, targetFolderId, filename);

    const {
      uploadUrl,
      expirationDateTime
    } = sessionData;

    if (!uploadUrl) {
      throw new Error('No upload URL returned from Microsoft Graph');
    }

    // Create pending video record in database
    const { data: videoRecord, error: insertError } = await supabase
      .from('product_videos')
      .insert({
        user_id: userId,
        product_id: productId || null,
        onedrive_file_id: 'pending', // Will be updated after upload completes
        onedrive_path: `${targetFolderId}/${filename}`,
        filename: filename,
        file_size: fileSize,
        upload_status: 'pending',
        mime_type: body.mimeType || null
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error creating video record:', insertError);
      // Continue anyway - session is created
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        uploadUrl,
        expirationDateTime,
        sessionId: videoRecord?.id,
        message: 'Upload session created. Upload file chunks to uploadUrl.',
        instructions: {
          chunkSize: 'Recommended: 5-10 MB chunks',
          method: 'PUT with Content-Range header',
          example: 'Content-Range: bytes 0-999999/1000000'
        }
      })
    };

  } catch (error) {
    console.error('OneDrive upload session error:', error);
    
    let userMessage = 'Failed to create upload session';
    if (error.message.includes('not connected')) {
      userMessage = 'OneDrive not connected. Please connect your account first.';
    } else if (error.message.includes('401')) {
      userMessage = 'OneDrive authorization expired. Please reconnect your account.';
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
