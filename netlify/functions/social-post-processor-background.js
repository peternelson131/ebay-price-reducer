/**
 * Social Post Processor - Background Function
 * Netlify Background Functions can run up to 15 minutes.
 * This handles the actual posting to social platforms.
 */

const { createClient } = require('@supabase/supabase-js');
const { getValidAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;
const TRANSCODER_URL = process.env.TRANSCODER_URL;

exports.handler = async (event, context) => {
  const { jobId, userId, video, platforms, title, description } = JSON.parse(event.body || '{}');
  
  console.log(`[BG Job ${jobId}] Starting processing for platforms:`, platforms);
  
  if (!jobId) {
    console.error('No jobId provided');
    return { statusCode: 400 };
  }

  try {
    // Update status to processing
    await supabase
      .from('social_post_jobs')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', jobId);

    const results = [];

    // Post to YouTube if requested
    if (platforms.includes('youtube')) {
      console.log(`[BG Job ${jobId}] Posting to YouTube`);
      const ytResult = await postToYouTube(userId, video, title, description);
      results.push(ytResult);
      await updateJobResults(jobId, results);
    }

    // Post to Facebook/Instagram if requested
    const metaPlatforms = platforms.filter(p => p === 'facebook' || p === 'instagram');
    if (metaPlatforms.length > 0) {
      const { data: metaConnection } = await supabase
        .from('social_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'meta')
        .single();

      if (!metaConnection) {
        metaPlatforms.forEach(p => results.push({ platform: p, success: false, error: 'Meta not connected' }));
      } else {
        let accessToken = metaConnection.access_token;
        
        if (metaPlatforms.includes('facebook')) {
          console.log(`[BG Job ${jobId}] Posting to Facebook`);
          const fbResult = await postToFacebook(userId, video, metaConnection, accessToken, title, description);
          results.push(fbResult);
          await updateJobResults(jobId, results);
        }

        if (metaPlatforms.includes('instagram')) {
          if (!metaConnection.instagram_account_id) {
            results.push({ platform: 'instagram', success: false, error: 'Instagram not linked' });
          } else {
            console.log(`[BG Job ${jobId}] Posting to Instagram`);
            const igResult = await postToInstagram(userId, video, metaConnection, accessToken, title, description);
            results.push(igResult);
            await updateJobResults(jobId, results);
          }
        }
      }
    }

    // Update final status
    const resultsObj = {};
    results.forEach(r => { resultsObj[r.platform] = r; });
    const hasSuccess = results.some(r => r.success);
    
    await supabase
      .from('social_post_jobs')
      .update({ 
        status: hasSuccess ? 'completed' : 'failed',
        results: resultsObj,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[BG Job ${jobId}] Completed:`, resultsObj);

  } catch (error) {
    console.error(`[BG Job ${jobId}] Fatal error:`, error);
    await supabase
      .from('social_post_jobs')
      .update({ 
        status: 'failed',
        error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }

  return { statusCode: 202 };
};

async function updateJobResults(jobId, results) {
  const resultsObj = {};
  results.forEach(r => { resultsObj[r.platform] = r; });
  await supabase
    .from('social_post_jobs')
    .update({ results: resultsObj, updated_at: new Date().toISOString() })
    .eq('id', jobId);
}

// ============= YouTube =============
async function postToYouTube(userId, video, title, description) {
  try {
    const { data: ytConnection } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .single();

    if (!ytConnection) {
      return { platform: 'youtube', success: false, error: 'YouTube not connected' };
    }

    let accessToken = ytConnection.access_token;
    
    // Refresh if needed
    if (ytConnection.refresh_token && new Date(ytConnection.token_expires_at) < new Date()) {
      const refreshed = await refreshGoogleToken(ytConnection.refresh_token);
      if (refreshed) {
        accessToken = refreshed;
        await supabase
          .from('social_connections')
          .update({ access_token: refreshed, token_expires_at: new Date(Date.now() + 3600000).toISOString() })
          .eq('id', ytConnection.id);
      }
    }

    // Get video from OneDrive
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      throw new Error('Failed to download from OneDrive');
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    // Upload to YouTube
    const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Length': videoBuffer.byteLength.toString(),
        'X-Upload-Content-Type': 'video/mp4'
      },
      body: JSON.stringify({
        snippet: { title, description, categoryId: '22' },
        status: { privacyStatus: 'public', selfDeclaredMadeForKids: false }
      })
    });

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      throw new Error(`YouTube init failed: ${errText}`);
    }

    const uploadUrl = initResponse.headers.get('Location');
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: videoBuffer
    });

    const uploadData = await uploadResponse.json();

    if (uploadData.error) {
      throw new Error(uploadData.error.message);
    }

    return {
      platform: 'youtube',
      success: true,
      videoId: uploadData.id,
      url: `https://youtube.com/watch?v=${uploadData.id}`
    };
  } catch (error) {
    console.error('YouTube error:', error);
    return { platform: 'youtube', success: false, error: error.message };
  }
}

async function refreshGoogleToken(refreshToken) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    });
    const data = await response.json();
    return data.access_token || null;
  } catch (error) {
    return null;
  }
}

// ============= Facebook =============
async function postToFacebook(userId, video, connection, accessToken, title, description) {
  try {
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      throw new Error('Failed to download from OneDrive');
    }

    const videoBuffer = await videoResponse.arrayBuffer();

    // Init upload
    const initUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    initUrl.searchParams.set('access_token', accessToken);
    initUrl.searchParams.set('upload_phase', 'start');
    initUrl.searchParams.set('file_size', videoBuffer.byteLength.toString());

    const initResponse = await fetch(initUrl.toString(), { method: 'POST' });
    const initData = await initResponse.json();

    if (initData.error) throw new Error(initData.error.message);

    const uploadSessionId = initData.upload_session_id;
    let startOffset = parseInt(initData.start_offset, 10);
    let endOffset = parseInt(initData.end_offset, 10);

    // Upload chunks
    while (startOffset < videoBuffer.byteLength) {
      const chunk = Buffer.from(videoBuffer.slice(startOffset, endOffset));
      
      const transferUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
      transferUrl.searchParams.set('access_token', accessToken);
      transferUrl.searchParams.set('upload_phase', 'transfer');
      transferUrl.searchParams.set('upload_session_id', uploadSessionId);
      transferUrl.searchParams.set('start_offset', startOffset.toString());

      const transferResponse = await fetch(transferUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: chunk
      });

      const transferData = await transferResponse.json();
      if (transferData.error) throw new Error(transferData.error.message);

      startOffset = parseInt(transferData.start_offset, 10);
      endOffset = parseInt(transferData.end_offset, 10);
    }

    // Finalize
    const finalizeUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    finalizeUrl.searchParams.set('access_token', accessToken);
    finalizeUrl.searchParams.set('upload_phase', 'finish');
    finalizeUrl.searchParams.set('upload_session_id', uploadSessionId);
    finalizeUrl.searchParams.set('description', description);

    const finalizeResponse = await fetch(finalizeUrl.toString(), { method: 'POST' });
    const finalizeData = await finalizeResponse.json();

    if (finalizeData.error) throw new Error(finalizeData.error.message);

    return {
      platform: 'facebook',
      success: true,
      postId: finalizeData.id,
      url: `https://facebook.com/${finalizeData.id}`
    };
  } catch (error) {
    console.error('Facebook error:', error);
    return { platform: 'facebook', success: false, error: error.message };
  }
}

// ============= Instagram =============
async function postToInstagram(userId, video, connection, accessToken, title, description) {
  try {
    if (!TRANSCODER_URL) {
      throw new Error('TRANSCODER_URL not configured');
    }

    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;

    console.log('Calling transcoder for Instagram...');
    
    // Call transcoder (can take several minutes for large files)
    const transcodeResponse = await fetch(`${TRANSCODER_URL}/transcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${onedriveToken}`
      },
      body: JSON.stringify({ videoUrl: downloadUrl })
    });

    if (!transcodeResponse.ok) {
      const errText = await transcodeResponse.text();
      throw new Error(`Transcoding failed: ${errText}`);
    }

    const { transcodedUrl, fileName } = await transcodeResponse.json();
    console.log('Transcoded URL:', transcodedUrl);

    // Create Instagram container
    const createUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media`);
    createUrl.searchParams.set('access_token', accessToken);
    createUrl.searchParams.set('video_url', transcodedUrl);
    createUrl.searchParams.set('media_type', 'REELS');
    createUrl.searchParams.set('caption', description.substring(0, 2200));

    const createResponse = await fetch(createUrl.toString(), { method: 'POST' });
    const createData = await createResponse.json();

    if (createData.error) {
      throw new Error(`Instagram container: ${createData.error.message}`);
    }

    const containerId = createData.id;
    console.log('Instagram container:', containerId);

    // Wait for processing (up to 5 minutes)
    let isReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 5000));
      
      const statusUrl = new URL(`https://graph.facebook.com/v18.0/${containerId}`);
      statusUrl.searchParams.set('access_token', accessToken);
      statusUrl.searchParams.set('fields', 'status_code');
      
      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json();
      
      console.log(`Instagram status check ${i+1}: ${statusData.status_code}`);
      
      if (statusData.status_code === 'FINISHED') {
        isReady = true;
        break;
      } else if (statusData.status_code === 'ERROR') {
        throw new Error('Instagram processing failed');
      }
    }

    if (!isReady) {
      throw new Error('Instagram processing timeout');
    }

    // Publish
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    publishUrl.searchParams.set('creation_id', containerId);

    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      throw new Error(`Instagram publish: ${publishData.error.message}`);
    }

    // Cleanup transcoded file
    try {
      if (fileName) {
        const { createClient } = require('@supabase/supabase-js');
        const cleanupSupabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        await cleanupSupabase.storage.from('social-media-temp').remove([fileName]);
      }
    } catch (e) { console.log('Cleanup failed:', e); }

    return {
      platform: 'instagram',
      success: true,
      postId: publishData.id,
      url: `https://instagram.com/reel/${publishData.id}`
    };
  } catch (error) {
    console.error('Instagram error:', error);
    return { platform: 'instagram', success: false, error: error.message };
  }
}
