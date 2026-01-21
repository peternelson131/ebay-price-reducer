/**
 * Check Dub Status - Poll Eleven Labs and complete upload if ready
 * 
 * POST /check-dub-status
 * Body: { variantId }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { decrypt } = require('./utils/encryption');
const { graphApiRequest, getValidAccessToken } = require('./utils/onedrive-api');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Create language subfolder in OneDrive if needed
 */
async function ensureLanguageFolder(userId, language) {
  const { data: connection } = await supabase
    .from('user_onedrive_connections')
    .select('video_folder_id')
    .eq('user_id', userId)
    .single();

  if (!connection?.video_folder_id) {
    throw new Error('OneDrive video folder not configured');
  }

  const folderName = `content-${language.toLowerCase()}`;
  
  try {
    const children = await graphApiRequest(
      userId,
      `/me/drive/items/${connection.video_folder_id}/children?$filter=name eq '${folderName}'`
    );
    
    if (children.value && children.value.length > 0) {
      return children.value[0];
    }
  } catch (e) {
    // Continue to create
  }
  
  const newFolder = await graphApiRequest(
    userId,
    `/me/drive/items/${connection.video_folder_id}/children`,
    {
      method: 'POST',
      body: JSON.stringify({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace'
      })
    }
  );
  
  return newFolder;
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;
    const { variantId } = JSON.parse(event.body || '{}');

    if (!variantId) {
      return errorResponse(400, 'variantId required', headers);
    }

    // Get variant with video info
    const { data: variant, error: variantError } = await supabase
      .from('video_variants')
      .select(`
        *,
        product_videos (
          id,
          user_id,
          filename,
          mime_type,
          onedrive_file_id,
          sourced_products (asin)
        )
      `)
      .eq('id', variantId)
      .single();

    if (variantError || !variant) {
      return errorResponse(404, 'Variant not found', headers);
    }

    // Verify ownership
    if (variant.product_videos.user_id !== userId) {
      return errorResponse(403, 'Access denied', headers);
    }

    // If already complete or no job ID, return current status
    if (variant.dub_status === 'complete') {
      return successResponse({
        status: 'complete',
        message: 'Dubbing already complete',
        onedrive_path: variant.onedrive_path
      }, headers);
    }

    if (!variant.dub_job_id) {
      return errorResponse(400, 'No dubbing job found for this variant', headers);
    }

    // Get Eleven Labs API key
    const { data: apiKeyRecord } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('service', 'elevenlabs')
      .single();

    if (!apiKeyRecord) {
      return errorResponse(400, 'Eleven Labs API key not configured', headers);
    }

    const elevenLabsKey = decrypt(apiKeyRecord.api_key_encrypted);

    // Check Eleven Labs status
    console.log(`Checking dub status for job: ${variant.dub_job_id}`);
    
    const statusResponse = await fetch(`https://api.elevenlabs.io/v1/dubbing/${variant.dub_job_id}`, {
      headers: { 'xi-api-key': elevenLabsKey }
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Eleven Labs status error:', errorText);
      return errorResponse(500, `Failed to check status: ${errorText}`, headers);
    }

    const dubStatus = await statusResponse.json();
    console.log('Eleven Labs status:', dubStatus.status);

    if (dubStatus.status === 'dubbing') {
      return successResponse({
        status: 'processing',
        message: 'Dubbing still in progress. Try again in a minute.',
        elevenLabsStatus: dubStatus.status
      }, headers);
    }

    if (dubStatus.status === 'failed') {
      await supabase
        .from('video_variants')
        .update({ dub_status: 'failed', error_message: 'Dubbing failed at Eleven Labs' })
        .eq('id', variantId);

      return successResponse({
        status: 'failed',
        message: 'Dubbing failed at Eleven Labs'
      }, headers);
    }

    if (dubStatus.status === 'dubbed') {
      console.log('Dubbing complete! Downloading and uploading to OneDrive...');

      // Download dubbed video from Eleven Labs
      const mediaResponse = await fetch(
        `https://api.elevenlabs.io/v1/dubbing/${variant.dub_job_id}/audio/${variant.language_code}`,
        { headers: { 'xi-api-key': elevenLabsKey } }
      );

      if (!mediaResponse.ok) {
        const errorText = await mediaResponse.text();
        console.error('Failed to download dubbed video:', errorText);
        return errorResponse(500, `Failed to download dubbed video: ${errorText}`, headers);
      }

      const dubbedBuffer = Buffer.from(await mediaResponse.arrayBuffer());
      console.log(`Downloaded ${dubbedBuffer.length} bytes`);

      // Create language folder and upload
      const folder = await ensureLanguageFolder(userId, variant.language);
      
      const uploadResponse = await graphApiRequest(
        userId,
        `/me/drive/items/${folder.id}:/${variant.filename}:/content`,
        {
          method: 'PUT',
          headers: { 'Content-Type': variant.product_videos.mime_type || 'video/mp4' },
          body: dubbedBuffer
        }
      );

      console.log(`Uploaded to OneDrive: ${variant.filename}`);

      // Update variant record
      await supabase
        .from('video_variants')
        .update({
          onedrive_file_id: uploadResponse.id,
          onedrive_path: `${folder.name}/${variant.filename}`,
          file_size: dubbedBuffer.length,
          dub_status: 'complete',
          completed_at: new Date().toISOString()
        })
        .eq('id', variantId);

      return successResponse({
        status: 'complete',
        message: 'Dubbed video uploaded to OneDrive!',
        onedrive_path: `${folder.name}/${variant.filename}`,
        file_size: dubbedBuffer.length
      }, headers);
    }

    // Unknown status
    return successResponse({
      status: 'unknown',
      message: `Unknown Eleven Labs status: ${dubStatus.status}`,
      elevenLabsStatus: dubStatus.status
    }, headers);

  } catch (error) {
    console.error('Check dub status error:', error);
    return errorResponse(500, error.message, headers);
  }
};
