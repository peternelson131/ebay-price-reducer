/**
 * Video Download - Get download URL for a video file from OneDrive
 * 
 * GET /video-download?videoId=xxx
 * Returns a temporary download URL for the video
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const videoId = event.queryStringParameters?.videoId;

    if (!videoId) {
      return errorResponse(400, 'videoId required', headers);
    }

    // Fetch the video record
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('*')
      .eq('id', videoId)
      .eq('user_id', userId)
      .single();

    if (videoError || !video) {
      console.error('Video not found:', videoError);
      return errorResponse(404, 'Video not found', headers);
    }

    // Check if video has an OneDrive path
    if (!video.onedrive_item_id && !video.onedrive_path) {
      return errorResponse(400, 'Video not stored in OneDrive', headers);
    }

    // Get download URL from OneDrive
    // Use item ID if available (more reliable), otherwise use path
    let downloadUrl;
    
    if (video.onedrive_item_id) {
      // Use item ID
      const result = await graphApiRequest(
        userId, 
        `/me/drive/items/${video.onedrive_item_id}`
      );
      
      downloadUrl = result['@microsoft.graph.downloadUrl'];
    } else if (video.onedrive_path) {
      // Use path - need to encode it properly
      const encodedPath = video.onedrive_path.split('/').map(encodeURIComponent).join('/');
      const result = await graphApiRequest(
        userId,
        `/me/drive/root:/${encodedPath}`
      );
      
      downloadUrl = result['@microsoft.graph.downloadUrl'];
    }

    if (!downloadUrl) {
      return errorResponse(500, 'Could not generate download URL', headers);
    }

    return successResponse({
      success: true,
      downloadUrl,
      filename: video.filename,
      fileSize: video.file_size
    }, headers);

  } catch (error) {
    console.error('Error in video-download:', error);
    
    // Check for OneDrive not connected
    if (error.message?.includes('OneDrive not connected')) {
      return errorResponse(400, 'OneDrive not connected. Please connect in Settings.', headers);
    }
    
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
