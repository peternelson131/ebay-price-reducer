/**
 * Thumbnail Folder - Save user's OneDrive thumbnail folder preference
 * 
 * POST /thumbnail-folder
 * Body: { folder_id, folder_path }
 * 
 * GET /thumbnail-folder
 * Returns: { folder_id, folder_path }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const method = event.httpMethod;

    // GET - Retrieve current folder setting
    if (method === 'GET') {
      const { data, error } = await supabase
        .from('user_onedrive_connections')
        .select('thumbnail_folder_id, thumbnail_folder_path')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Get folder error:', error);
        return errorResponse(500, 'Failed to get folder setting', headers);
      }

      return successResponse({
        success: true,
        folder_id: data?.thumbnail_folder_id || null,
        folder_path: data?.thumbnail_folder_path || null
      }, headers);
    }

    // POST - Save folder setting
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { folder_id, folder_path } = body;

      if (!folder_id || !folder_path) {
        return errorResponse(400, 'Missing folder_id or folder_path', headers);
      }

      const { error } = await supabase
        .from('user_onedrive_connections')
        .update({
          thumbnail_folder_id: folder_id,
          thumbnail_folder_path: folder_path
        })
        .eq('user_id', userId);

      if (error) {
        console.error('Save folder error:', error);
        return errorResponse(500, 'Failed to save folder setting', headers);
      }

      return successResponse({
        success: true,
        folder_id,
        folder_path
      }, headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Thumbnail folder error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
