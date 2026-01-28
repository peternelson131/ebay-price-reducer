/**
 * Get Thumbnail - Retrieve thumbnail download URL for an ASIN
 * 
 * GET /get-thumbnail?asin=B0xxx
 * 
 * Looks up the product by ASIN, finds associated thumbnail in OneDrive,
 * and returns a download URL.
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
    // Verify auth
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const asin = event.queryStringParameters?.asin;

    if (!asin) {
      return errorResponse(400, 'Missing required parameter: asin', headers);
    }

    console.log(`Looking up thumbnail for ASIN: ${asin}`);

    // FIRST: Check influencer_tasks for generated thumbnail (stored in Supabase Storage)
    const { data: task } = await supabase
      .from('influencer_tasks')
      .select('image_url, search_asin')
      .eq('asin', asin)
      .eq('user_id', userId)
      .single();
    
    // Check if this task has a generated thumbnail
    if (task?.image_url && task.image_url.includes('supabase')) {
      console.log(`Found generated thumbnail in influencer_tasks for ${asin}`);
      return successResponse({
        success: true,
        asin,
        filename: `${asin}_thumbnail.jpg`,
        downloadUrl: task.image_url,
        source: 'generated'
      }, headers);
    }
    
    // SECOND: If this is a correlated ASIN, check the search ASIN's thumbnail
    if (task?.search_asin && task.search_asin !== asin) {
      const { data: parentTask } = await supabase
        .from('influencer_tasks')
        .select('image_url')
        .eq('asin', task.search_asin)
        .eq('user_id', userId)
        .single();
      
      if (parentTask?.image_url && parentTask.image_url.includes('supabase')) {
        console.log(`Found thumbnail from search ASIN ${task.search_asin} for correlated ${asin}`);
        return successResponse({
          success: true,
          asin,
          filename: `${asin}_thumbnail.jpg`,
          downloadUrl: parentTask.image_url,
          source: 'inherited'
        }, headers);
      }
    }

    // FALLBACK: Check OneDrive for thumbnail
    // Get user's OneDrive connection with thumbnail folder
    const { data: connection } = await supabase
      .from('user_onedrive_connections')
      .select('thumbnail_folder_id, thumbnail_folder_path')
      .eq('user_id', userId)
      .single();
    
    const folderId = connection?.thumbnail_folder_id;
    const folderPath = connection?.thumbnail_folder_path || '/Apps/eBay Price Reducer/Thumbnails';

    // Look for thumbnail file in OneDrive thumbnails folder
    // Thumbnails are named {asin}_timestamp.jpg
    try {
      // List files in thumbnails folder
      let listResult;
      if (folderId) {
        listResult = await graphApiRequest(
          userId,
          `/me/drive/items/${folderId}/children?$filter=startswith(name,'${asin}_')`
        );
      } else {
        listResult = await graphApiRequest(
          userId,
          `/me/drive/root:${folderPath}:/children?$filter=startswith(name,'${asin}_')`
        );
      }
      
      if (listResult.value && listResult.value.length > 0) {
        // Get the most recent thumbnail (they have timestamps)
        const thumbnails = listResult.value.sort((a, b) => 
          new Date(b.createdDateTime) - new Date(a.createdDateTime)
        );
        
        const thumbnail = thumbnails[0];
        
        // Get download URL
        const fileResult = await graphApiRequest(
          userId,
          `/me/drive/items/${thumbnail.id}`
        );
        
        if (fileResult['@microsoft.graph.downloadUrl']) {
          return successResponse({
            success: true,
            asin,
            filename: thumbnail.name,
            downloadUrl: fileResult['@microsoft.graph.downloadUrl']
          }, headers);
        }
      }
      
      // No thumbnail found
      return successResponse({
        success: false,
        asin,
        reason: 'No thumbnail found for this ASIN'
      }, headers);
      
    } catch (driveError) {
      console.error('OneDrive error:', driveError);
      
      // Folder might not exist yet
      if (driveError.message?.includes('404') || driveError.message?.includes('not found')) {
        return successResponse({
          success: false,
          asin,
          reason: 'Thumbnails folder not found'
        }, headers);
      }
      
      throw driveError;
    }

  } catch (error) {
    console.error('Get thumbnail error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
