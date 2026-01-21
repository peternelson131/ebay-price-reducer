/**
 * Videos - Video metadata CRUD operations
 * 
 * GET    /videos?productId=xxx              - List videos for user/product
 * POST   /videos                             - Save video metadata after upload
 * DELETE /videos/:id                         - Remove video record
 * PATCH  /videos/:id                         - Update video metadata
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
 * GET - List videos
 */
async function handleGet(userId, params) {
  const { productId, status } = params;

  let query = supabase
    .from('product_videos')
    .select('*')
    .eq('user_id', userId);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  if (status) {
    query = query.eq('upload_status', status);
  }

  // Order by most recent first
  query = query.order('created_at', { ascending: false });

  const { data: videos, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }

  return {
    videos,
    totalCount: videos.length
  };
}

/**
 * POST - Create/update video metadata after successful upload
 */
async function handlePost(userId, body) {
  const {
    sessionId,           // From upload session
    productId,
    onedrive_file_id,   // From OneDrive after upload completes
    onedrive_path,
    filename,
    file_size,
    mime_type,
    thumbnail_url,
    duration_seconds
  } = body;

  // Required fields
  if (!onedrive_file_id || !filename) {
    throw new Error('onedrive_file_id and filename are required');
  }

  // If sessionId provided, update existing record
  if (sessionId) {
    const { data: updated, error } = await supabase
      .from('product_videos')
      .update({
        onedrive_file_id,
        onedrive_path: onedrive_path || undefined,
        filename: filename || undefined,
        file_size: file_size || undefined,
        mime_type: mime_type || undefined,
        thumbnail_url: thumbnail_url || undefined,
        duration_seconds: duration_seconds || undefined,
        upload_status: 'complete'
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update video: ${error.message}`);
    }

    return updated;
  }

  // Otherwise, create new record
  const { data: created, error: insertError } = await supabase
    .from('product_videos')
    .insert({
      user_id: userId,
      product_id: productId || null,
      onedrive_file_id,
      onedrive_path: onedrive_path || `/${filename}`,
      filename,
      file_size: file_size || null,
      mime_type: mime_type || null,
      thumbnail_url: thumbnail_url || null,
      duration_seconds: duration_seconds || null,
      upload_status: 'complete'
    })
    .select()
    .single();

  if (insertError) {
    // Handle duplicate constraint violation
    if (insertError.code === '23505') { // Unique constraint violation
      throw new Error('Video already exists with this OneDrive file ID');
    }
    throw new Error(`Failed to create video: ${insertError.message}`);
  }

  return created;
}

/**
 * PATCH - Update video metadata
 */
async function handlePatch(userId, videoId, body) {
  const allowedFields = [
    'product_id',
    'thumbnail_url',
    'duration_seconds',
    'upload_status'
  ];

  // Filter to only allowed fields
  const updates = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data: updated, error } = await supabase
    .from('product_videos')
    .update(updates)
    .eq('id', videoId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // No rows returned
      throw new Error('Video not found or does not belong to user');
    }
    throw new Error(`Failed to update video: ${error.message}`);
  }

  return updated;
}

/**
 * DELETE - Remove video record
 * Note: Does NOT delete from OneDrive, only removes DB record
 */
async function handleDelete(userId, videoId, params) {
  const { deleteFromOneDrive } = params;

  // First get the video to check ownership and get file ID
  const { data: video, error: fetchError } = await supabase
    .from('product_videos')
    .select('*')
    .eq('id', videoId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !video) {
    throw new Error('Video not found or does not belong to user');
  }

  // Delete from OneDrive if requested
  if (deleteFromOneDrive === 'true' && video.onedrive_file_id !== 'pending') {
    try {
      await graphApiRequest(
        userId, 
        `/me/drive/items/${video.onedrive_file_id}`,
        { method: 'DELETE' }
      );
    } catch (error) {
      console.error('Failed to delete file from OneDrive:', error);
      // Continue with DB deletion even if OneDrive delete fails
    }
  }

  // Delete database record
  const { error: deleteError } = await supabase
    .from('product_videos')
    .delete()
    .eq('id', videoId)
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`Failed to delete video: ${deleteError.message}`);
  }

  return {
    success: true,
    message: 'Video deleted',
    deletedFromOneDrive: deleteFromOneDrive === 'true'
  };
}

// =============================================================================
// Main Handler
// =============================================================================

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
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
    const method = event.httpMethod;
    const params = event.queryStringParameters || {};
    
    // Extract video ID from path for DELETE/PATCH
    const pathParts = event.path.split('/');
    const videoId = pathParts[pathParts.length - 1];

    let result;

    switch (method) {
      case 'GET':
        result = await handleGet(userId, params);
        break;

      case 'POST':
        const postBody = JSON.parse(event.body || '{}');
        result = await handlePost(userId, postBody);
        break;

      case 'PATCH':
        if (!videoId || videoId === 'videos') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Video ID required in path' })
          };
        }
        const patchBody = JSON.parse(event.body || '{}');
        result = await handlePatch(userId, videoId, patchBody);
        break;

      case 'DELETE':
        if (!videoId || videoId === 'videos') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Video ID required in path' })
          };
        }
        result = await handleDelete(userId, videoId, params);
        break;

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Videos API error:', error);
    
    return {
      statusCode: error.message.includes('not found') ? 404 : 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
