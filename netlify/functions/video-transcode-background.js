/**
 * Video Transcode Background Function
 * Pre-transcodes videos from OneDrive to Supabase Storage for instant social posting
 * 
 * Flow:
 * 1. Download video from OneDrive
 * 2. Call Railway transcoder service
 * 3. Upload transcoded video to Supabase Storage
 * 4. Update product_videos with social_ready_url
 * 
 * Netlify Background Functions can run up to 15 minutes.
 */

const { createClient } = require('@supabase/supabase-js');
const { getValidAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRANSCODER_URL = process.env.TRANSCODER_URL;
const STORAGE_BUCKET = 'transcoded-videos';

/**
 * Update video status in database
 */
async function updateVideoStatus(videoId, status, updates = {}) {
  const payload = {
    social_ready_status: status,
    ...updates
  };

  if (status === 'ready') {
    payload.social_ready_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('product_videos')
    .update(payload)
    .eq('id', videoId);

  if (error) {
    console.error(`Failed to update video ${videoId} status to ${status}:`, error);
  }
}

/**
 * Download video from OneDrive
 */
async function downloadFromOneDrive(userId, onedriveFileId) {
  console.log(`Downloading video ${onedriveFileId} from OneDrive...`);

  const { accessToken } = await getValidAccessToken(userId);
  const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${onedriveFileId}/content`;

  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to download from OneDrive: ${response.status} ${errorText}`);
  }

  return { downloadUrl, accessToken };
}

/**
 * Transcode video using Railway service
 */
async function transcodeVideo(downloadUrl, onedriveToken) {
  if (!TRANSCODER_URL) {
    throw new Error('TRANSCODER_URL environment variable not configured');
  }

  console.log('Calling transcoder service...');

  const response = await fetch(`${TRANSCODER_URL}/transcode`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${onedriveToken}`
    },
    body: JSON.stringify({ videoUrl: downloadUrl })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Transcoding failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  console.log('Transcode complete:', data.fileName);

  return data; // { transcodedUrl, fileName }
}

/**
 * Upload transcoded video to Supabase Storage
 */
async function uploadToSupabaseStorage(transcodedUrl, userId, videoId) {
  console.log('Downloading transcoded video for upload to Supabase...');

  // Download the transcoded video
  const videoResponse = await fetch(transcodedUrl);
  
  if (!videoResponse.ok) {
    throw new Error(`Failed to download transcoded video: ${videoResponse.status}`);
  }

  const videoBuffer = await videoResponse.arrayBuffer();
  const fileSize = videoBuffer.byteLength;
  console.log(`Downloaded ${(fileSize / 1024 / 1024).toFixed(2)}MB`);

  // Upload to Supabase Storage
  const storagePath = `${userId}/${videoId}.mp4`;
  console.log(`Uploading to Supabase Storage: ${STORAGE_BUCKET}/${storagePath}`);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, videoBuffer, {
      contentType: 'video/mp4',
      upsert: true // Overwrite if exists (idempotent)
    });

  if (uploadError) {
    throw new Error(`Supabase Storage upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(storagePath);

  console.log('Upload complete. Public URL:', publicUrl);

  return { publicUrl, fileSize };
}

/**
 * Cleanup transcoded file from Railway service
 */
async function cleanupTranscodedFile(fileName) {
  if (!TRANSCODER_URL || !fileName) {
    return;
  }

  try {
    console.log('Cleaning up transcoded file:', fileName);
    await fetch(`${TRANSCODER_URL}/cleanup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName })
    });
  } catch (error) {
    console.error('Cleanup failed (non-critical):', error.message);
  }
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  let videoId, userId, onedriveFileId, fileName;

  try {
    // Parse request
    const body = JSON.parse(event.body || '{}');
    videoId = body.videoId;

    if (!videoId) {
      console.error('No videoId provided');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'videoId is required' })
      };
    }

    console.log(`[Video Transcode] Starting for video ${videoId}`);

    // Fetch video record
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('*')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      throw new Error(`Video not found: ${videoId}`);
    }

    userId = video.user_id;
    onedriveFileId = video.onedrive_file_id;

    // Check if already processed or processing
    if (video.social_ready_status === 'ready') {
      console.log('Video already transcoded, skipping');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Video already transcoded',
          url: video.social_ready_url
        })
      };
    }

    if (video.social_ready_status === 'processing') {
      console.log('Video already processing, skipping duplicate job');
      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Already processing' })
      };
    }

    // Update status to processing
    await updateVideoStatus(videoId, 'processing');

    // Step 1: Download from OneDrive
    const { downloadUrl, accessToken } = await downloadFromOneDrive(userId, onedriveFileId);

    // Step 2: Transcode video
    const { transcodedUrl, fileName: transcodedFileName } = await transcodeVideo(downloadUrl, accessToken);
    fileName = transcodedFileName;

    // Step 3: Upload to Supabase Storage
    const { publicUrl, fileSize } = await uploadToSupabaseStorage(transcodedUrl, userId, videoId);

    // Step 4: Update video record with public URL
    await updateVideoStatus(videoId, 'ready', {
      social_ready_url: publicUrl,
      social_ready_error: null
    });

    // Step 5: Cleanup temporary transcoded file
    await cleanupTranscodedFile(fileName);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[Video Transcode] Completed in ${duration}s`);
    console.log(`Public URL: ${publicUrl}`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        videoId,
        url: publicUrl,
        fileSize,
        duration: `${duration}s`
      })
    };

  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`[Video Transcode] Failed after ${duration}s:`, error);

    // Update video status to failed with error message
    if (videoId) {
      await updateVideoStatus(videoId, 'failed', {
        social_ready_error: error.message
      });
    }

    // Attempt cleanup on error
    if (fileName) {
      await cleanupTranscodedFile(fileName);
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        videoId,
        duration: `${duration}s`
      })
    };
  }
};
