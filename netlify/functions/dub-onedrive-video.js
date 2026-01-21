/**
 * Dub OneDrive Video - Dub a video from OneDrive and save back to OneDrive
 * 
 * POST /dub-onedrive-video
 * Body: { variantId, videoId, targetLanguage, userId }
 * 
 * Flow:
 * 1. Download original video from OneDrive
 * 2. Send to Eleven Labs for dubbing
 * 3. Poll for completion
 * 4. Download dubbed video
 * 5. Upload to OneDrive in language subfolder
 * 6. Update variant record
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { decrypt } = require('./utils/encryption');
const { graphApiRequest, getValidAccessToken } = require('./utils/onedrive-api');
const fetch = require('node-fetch');
const FormData = require('form-data');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LANGUAGE_NAMES = {
  'de': 'German',
  'fr': 'French', 
  'es': 'Spanish',
  'it': 'Italian',
  'ja': 'Japanese'
};

/**
 * Create language subfolder in OneDrive if it doesn't exist
 */
async function ensureLanguageFolder(userId, language) {
  try {
    // Get user's OneDrive connection to find the video folder
    const { data: connection } = await supabase
      .from('user_onedrive_connections')
      .select('video_folder_id')
      .eq('user_id', userId)
      .single();

    if (!connection?.video_folder_id) {
      throw new Error('OneDrive video folder not configured');
    }

    const folderName = `content-${language.toLowerCase()}`;
    
    // Try to find existing folder
    try {
      const children = await graphApiRequest(
        userId,
        `/me/drive/items/${connection.video_folder_id}/children?$filter=name eq '${folderName}'`
      );
      
      if (children.value && children.value.length > 0) {
        return children.value[0];
      }
    } catch (e) {
      // Folder doesn't exist, create it
    }
    
    // Create folder
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
    
    console.log(`Created folder: ${folderName}`);
    return newFolder;
  } catch (error) {
    console.error('Error ensuring language folder:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  console.log('🎬 dub-onedrive-video called');

  try {
    const { variantId, videoId, targetLanguage, userId } = JSON.parse(event.body || '{}');

    if (!variantId || !videoId || !targetLanguage || !userId) {
      return errorResponse(400, 'Missing required fields', headers);
    }

    const languageName = LANGUAGE_NAMES[targetLanguage];
    if (!languageName) {
      return errorResponse(400, `Unsupported language: ${targetLanguage}`, headers);
    }

    // Get original video info
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('*, sourced_products(asin)')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      await updateVariantStatus(variantId, 'failed', 'Original video not found');
      return errorResponse(404, 'Video not found', headers);
    }

    // Get user's Eleven Labs API key
    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('service', 'elevenlabs')
      .single();

    if (keyError || !apiKeyRecord) {
      await updateVariantStatus(variantId, 'failed', 'Eleven Labs API key not configured');
      return errorResponse(400, 'Eleven Labs API key not configured', headers);
    }

    const elevenLabsKey = decrypt(apiKeyRecord.api_key_encrypted);
    if (!elevenLabsKey) {
      await updateVariantStatus(variantId, 'failed', 'Failed to decrypt API key');
      return errorResponse(500, 'Failed to decrypt API key', headers);
    }

    // Step 1: Download video from OneDrive
    console.log('📥 Downloading from OneDrive...');
    const { accessToken } = await getValidAccessToken(userId);
    
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    const downloadResponse = await fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!downloadResponse.ok) {
      await updateVariantStatus(variantId, 'failed', 'Failed to download from OneDrive');
      return errorResponse(500, 'Failed to download video from OneDrive', headers);
    }

    const videoBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    console.log(`📥 Downloaded ${videoBuffer.length} bytes`);

    // Step 2: Send to Eleven Labs
    console.log('🎬 Sending to Eleven Labs...');
    const formData = new FormData();
    formData.append('file', videoBuffer, { 
      filename: video.filename, 
      contentType: video.mime_type || 'video/mp4' 
    });
    formData.append('target_lang', targetLanguage);
    formData.append('source_lang', 'en');
    formData.append('num_speakers', '1');
    formData.append('watermark', 'false');

    const dubResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!dubResponse.ok) {
      const errorText = await dubResponse.text();
      console.error('Eleven Labs error:', errorText);
      await updateVariantStatus(variantId, 'failed', `Eleven Labs error: ${errorText}`);
      return errorResponse(500, `Eleven Labs error: ${errorText}`, headers);
    }

    const dubResult = await dubResponse.json();
    const dubbingId = dubResult.dubbing_id;

    console.log(`✅ Dubbing job started: ${dubbingId}`);

    // Update variant with job ID - keep status as 'processing'
    await supabase
      .from('video_variants')
      .update({ 
        dub_job_id: dubbingId,
        dub_status: 'processing',
        error_message: null
      })
      .eq('id', variantId);

    // Return immediately - user will use Check Status to poll and complete
    return successResponse({
      success: true,
      status: 'processing',
      dubbingId,
      message: 'Dubbing started! Use "Check Status" button to check when complete.'
    }, headers);

  } catch (error) {
    console.error('Dub error:', error);
    return errorResponse(500, error.message, headers);
  }
};

async function updateVariantStatus(variantId, status, errorMessage = null) {
  await supabase
    .from('video_variants')
    .update({ 
      dub_status: status, 
      error_message: errorMessage,
      completed_at: status === 'failed' ? new Date().toISOString() : null
    })
    .eq('id', variantId);
}
