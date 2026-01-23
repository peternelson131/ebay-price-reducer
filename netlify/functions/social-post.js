/**
 * Social Post - Unified endpoint for posting to multiple social platforms
 * POST /social-post - Post a video to selected platforms (YouTube, Facebook, Instagram)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { getValidAccessToken } = require('./utils/onedrive-api');
const cloudinary = require('cloudinary').v2;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * Cloudinary Configuration for Instagram Video Transcoding
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME: Your Cloudinary cloud name
 * - CLOUDINARY_API_KEY: Your Cloudinary API key
 * - CLOUDINARY_API_SECRET: Your Cloudinary API secret
 * 
 * Instagram requires MP4 with H.264 video codec and AAC audio codec.
 * Cloudinary transcodes .mov and other formats to meet these requirements.
 */
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Configure Cloudinary if credentials are available
if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET
  });
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;
    const { videoId, platforms, title, description } = JSON.parse(event.body || '{}');

    if (!videoId) {
      return errorResponse(400, 'videoId is required', headers);
    }

    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return errorResponse(400, 'platforms array is required (e.g., ["youtube", "facebook", "instagram"])', headers);
    }

    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('*, sourced_products(title, asin, video_title)')
      .eq('id', videoId)
      .single();

    if (!video) {
      return errorResponse(404, 'Video not found', headers);
    }

    // Prepare metadata
    const videoTitle = title || video.sourced_products?.video_title || video.sourced_products?.title || video.filename;
    const videoDescription = description || 
      `Check out this product: https://amazon.com/dp/${video.sourced_products?.asin || ''}`;

    // Create job record in database
    const { data: job, error: jobError } = await supabase
      .from('social_post_jobs')
      .insert({
        user_id: userId,
        video_id: videoId,
        platforms,
        title: videoTitle,
        description: videoDescription,
        status: 'pending'
      })
      .select()
      .single();

    if (jobError) {
      console.error('Failed to create job:', jobError);
      return errorResponse(500, 'Failed to create post job', headers);
    }

    console.log('Created job:', job.id);

    // Invoke background function via HTTP (fire and forget)
    // Background functions in Netlify have suffix "-background" and can run up to 15 minutes
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    fetch(`${siteUrl}/.netlify/functions/social-post-processor-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: job.id,
        userId,
        video,
        platforms,
        title: videoTitle,
        description: videoDescription
      })
    }).catch(err => {
      console.error('Failed to invoke background function:', err);
    });

    // Return immediately with job ID
    return {
      statusCode: 202, // Accepted
      headers,
      body: JSON.stringify({
        jobId: job.id,
        status: 'pending',
        message: 'Post job created and processing in background'
      })
    };

  } catch (error) {
    console.error('Social post error:', error);
    return errorResponse(500, error.message || 'Failed to post to social media', headers);
  }
};

/**
 * Process job in background
 * This runs asynchronously after the API response is sent
 */
async function processJobInBackground(jobId, userId, video, platforms, videoTitle, videoDescription) {
  try {
    console.log(`[Job ${jobId}] Starting background processing`);
    
    // Update status to processing
    await supabase
      .from('social_post_jobs')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    const results = [];

    // Post to YouTube if requested
    if (platforms.includes('youtube')) {
      try {
        console.log(`[Job ${jobId}] Posting to YouTube`);
        const youtubeResult = await postToYouTube(userId, video, videoTitle, videoDescription);
        results.push(youtubeResult);
        
        // Record in database
        await supabase.from('scheduled_posts').insert({
          user_id: userId,
          video_id: video.id,
          platform: 'youtube',
          scheduled_for: new Date().toISOString(),
          title: videoTitle,
          description: videoDescription,
          status: youtubeResult.success ? 'posted' : 'failed',
          posted_at: youtubeResult.success ? new Date().toISOString() : null,
          platform_post_id: youtubeResult.videoId || null,
          platform_url: youtubeResult.url || null,
          error_message: youtubeResult.error || null
        });
      } catch (error) {
        console.error(`[Job ${jobId}] YouTube post error:`, error);
        results.push({
          platform: 'youtube',
          success: false,
          error: error.message
        });
        
        await supabase.from('scheduled_posts').insert({
          user_id: userId,
          video_id: video.id,
          platform: 'youtube',
          scheduled_for: new Date().toISOString(),
          title: videoTitle,
          description: videoDescription,
          status: 'failed',
          error_message: error.message
        });
      }
    }

    // Post to Facebook and/or Instagram if requested
    const metaPlatforms = platforms.filter(p => p === 'facebook' || p === 'instagram');
    if (metaPlatforms.length > 0) {
      // Get Meta connection
      const { data: metaConnection } = await supabase
        .from('social_connections')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'meta')
        .single();

      if (!metaConnection) {
        // Add failed results for requested Meta platforms
        metaPlatforms.forEach(platform => {
          results.push({
            platform,
            success: false,
            error: 'Meta not connected'
          });
          
          supabase.from('scheduled_posts').insert({
            user_id: userId,
            video_id: video.id,
            platform,
            scheduled_for: new Date().toISOString(),
            title: videoTitle,
            description: videoDescription,
            status: 'failed',
            error_message: 'Meta not connected'
          });
        });
      } else {
        // Refresh token if needed
        let accessToken = metaConnection.access_token;
        const tokenExpiresAt = new Date(metaConnection.token_expires_at);
        const now = new Date();
        
        if (tokenExpiresAt < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
          console.log(`[Job ${jobId}] Meta token expiring soon, attempting refresh`);
          const newToken = await refreshMetaToken(userId, metaConnection.access_token);
          if (newToken) {
            accessToken = newToken;
          }
        }

        // Post to Facebook if requested
        if (metaPlatforms.includes('facebook')) {
          try {
            console.log(`[Job ${jobId}] Posting to Facebook`);
            const fbResult = await postToFacebook(userId, video, metaConnection, accessToken, videoTitle, videoDescription);
            results.push(fbResult);
            
            await supabase.from('scheduled_posts').insert({
              user_id: userId,
              video_id: video.id,
              platform: 'facebook',
              scheduled_for: new Date().toISOString(),
              title: videoTitle,
              description: videoDescription,
              status: fbResult.success ? 'posted' : 'failed',
              posted_at: fbResult.success ? new Date().toISOString() : null,
              platform_post_id: fbResult.postId || null,
              platform_url: fbResult.url || null,
              error_message: fbResult.error || null
            });
          } catch (error) {
            console.error(`[Job ${jobId}] Facebook post error:`, error);
            results.push({
              platform: 'facebook',
              success: false,
              error: error.message
            });
            
            await supabase.from('scheduled_posts').insert({
              user_id: userId,
              video_id: video.id,
              platform: 'facebook',
              scheduled_for: new Date().toISOString(),
              title: videoTitle,
              description: videoDescription,
              status: 'failed',
              error_message: error.message
            });
          }
        }

        // Post to Instagram if requested
        if (metaPlatforms.includes('instagram')) {
          if (!metaConnection.instagram_account_id) {
            results.push({
              platform: 'instagram',
              success: false,
              error: 'Instagram account not linked to Facebook Page'
            });
            
            await supabase.from('scheduled_posts').insert({
              user_id: userId,
              video_id: video.id,
              platform: 'instagram',
              scheduled_for: new Date().toISOString(),
              title: videoTitle,
              description: videoDescription,
              status: 'failed',
              error_message: 'Instagram account not linked to Facebook Page'
            });
          } else {
            try {
              console.log(`[Job ${jobId}] Posting to Instagram`);
              const igResult = await postToInstagram(userId, video, metaConnection, accessToken, videoTitle, videoDescription);
              results.push(igResult);
              
              await supabase.from('scheduled_posts').insert({
                user_id: userId,
                video_id: video.id,
                platform: 'instagram',
                scheduled_for: new Date().toISOString(),
                title: videoTitle,
                description: videoDescription,
                status: igResult.success ? 'posted' : 'failed',
                posted_at: igResult.success ? new Date().toISOString() : null,
                platform_post_id: igResult.postId || null,
                platform_url: igResult.url || null,
                error_message: igResult.error || null
              });
            } catch (error) {
              console.error(`[Job ${jobId}] Instagram post error:`, error);
              results.push({
                platform: 'instagram',
                success: false,
                error: error.message
              });
              
              await supabase.from('scheduled_posts').insert({
                user_id: userId,
                video_id: video.id,
                platform: 'instagram',
                scheduled_for: new Date().toISOString(),
                title: videoTitle,
                description: videoDescription,
                status: 'failed',
                error_message: error.message
              });
            }
          }
        }
      }
    }

    // Update job with results
    const resultsObject = {};
    results.forEach(r => {
      resultsObject[r.platform] = {
        success: r.success,
        url: r.url || null,
        postId: r.postId || r.videoId || null,
        error: r.error || null
      };
    });

    await supabase
      .from('social_post_jobs')
      .update({
        status: 'completed',
        results: resultsObject,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);

    console.log(`[Job ${jobId}] Completed successfully. Posted to ${results.filter(r => r.success).length}/${results.length} platforms`);

  } catch (error) {
    console.error(`[Job ${jobId}] Background processing failed:`, error);
    
    // Update job with error
    await supabase
      .from('social_post_jobs')
      .update({
        status: 'failed',
        error: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId);
  }
}

/**
 * Post to YouTube (extracted from youtube-post.js logic)
 */
async function postToYouTube(userId, video, title, description) {
  try {
    // Get YouTube connection
    const { data: connection } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .single();

    if (!connection) {
      return {
        platform: 'youtube',
        success: false,
        error: 'YouTube not connected'
      };
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      accessToken = await refreshYouTubeToken(userId, connection.refresh_token);
      if (!accessToken) {
        return {
          platform: 'youtube',
          success: false,
          error: 'Failed to refresh YouTube token. Please reconnect.'
        };
      }
    }

    // Get video file from OneDrive
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    
    if (!video.onedrive_file_id) {
      return {
        platform: 'youtube',
        success: false,
        error: 'Video has no OneDrive ID'
      };
    }
    
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error('OneDrive download failed:', videoResponse.status, errorText);
      return {
        platform: 'youtube',
        success: false,
        error: `Failed to download video from OneDrive: ${videoResponse.status} ${errorText.substring(0, 100)}`
      };
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBytes = new Uint8Array(videoBuffer);

    // Upload to YouTube
    const youtubeVideoId = await uploadToYouTube(accessToken, videoBytes, {
      title: title.substring(0, 100),
      description: description.substring(0, 5000),
      privacyStatus: 'public',
      madeForKids: false
    });

    if (!youtubeVideoId) {
      return {
        platform: 'youtube',
        success: false,
        error: 'Upload to YouTube failed'
      };
    }

    const youtubeUrl = `https://youtube.com/shorts/${youtubeVideoId}`;
    
    return {
      platform: 'youtube',
      success: true,
      videoId: youtubeVideoId,
      url: youtubeUrl
    };
  } catch (error) {
    console.error('YouTube post error:', error);
    return {
      platform: 'youtube',
      success: false,
      error: error.message
    };
  }
}

async function refreshYouTubeToken(userId, refreshToken) {
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
    
    if (data.error) {
      console.error('Token refresh error:', data);
      return null;
    }

    await supabase
      .from('social_connections')
      .update({
        access_token: data.access_token,
        token_expires_at: new Date(Date.now() + (data.expires_in * 1000)).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'youtube');

    return data.access_token;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

async function uploadToYouTube(accessToken, videoBytes, metadata) {
  try {
    // Initialize resumable upload
    const initResponse = await fetch(
      'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Upload-Content-Type': 'video/*',
          'X-Upload-Content-Length': videoBytes.length
        },
        body: JSON.stringify({
          snippet: {
            title: metadata.title,
            description: metadata.description,
            categoryId: '22'
          },
          status: {
            privacyStatus: metadata.privacyStatus,
            selfDeclaredMadeForKids: metadata.madeForKids
          }
        })
      }
    );

    if (!initResponse.ok) {
      const error = await initResponse.text();
      console.error('YouTube init error:', error);
      return null;
    }

    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
      console.error('No upload URL returned');
      return null;
    }

    // Upload video content
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'video/*',
        'Content-Length': videoBytes.length
      },
      body: videoBytes
    });

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text();
      console.error('YouTube upload error:', error);
      return null;
    }

    const result = await uploadResponse.json();
    console.log('YouTube upload success:', result.id);
    
    return result.id;
  } catch (error) {
    console.error('YouTube upload error:', error);
    return null;
  }
}

/**
 * Refresh Meta token
 */
async function refreshMetaToken(userId, currentToken) {
  try {
    const refreshUrl = new URL('https://graph.facebook.com/v18.0/oauth/access_token');
    refreshUrl.searchParams.set('grant_type', 'fb_exchange_token');
    refreshUrl.searchParams.set('client_id', META_APP_ID);
    refreshUrl.searchParams.set('client_secret', META_APP_SECRET);
    refreshUrl.searchParams.set('fb_exchange_token', currentToken);

    const response = await fetch(refreshUrl.toString());
    const data = await response.json();

    if (data.error) {
      console.error('Token refresh error:', data.error);
      return null;
    }

    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 5184000;
    const newExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

    await supabase
      .from('social_connections')
      .update({
        access_token: newAccessToken,
        token_expires_at: newExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'meta');

    return newAccessToken;
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Post to Facebook
 */
async function postToFacebook(userId, video, connection, accessToken, title, description) {
  try {
    if (!video.onedrive_file_id) {
      throw new Error('Video has no OneDrive ID');
    }
    
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      const errorText = await videoResponse.text();
      console.error('OneDrive download failed for Facebook:', videoResponse.status, errorText);
      throw new Error(`Failed to download video from OneDrive: ${videoResponse.status} ${errorText.substring(0, 100)}`);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    
    // Initialize upload session
    const initUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    initUrl.searchParams.set('access_token', accessToken);
    initUrl.searchParams.set('upload_phase', 'start');
    initUrl.searchParams.set('file_size', videoBuffer.byteLength.toString());

    const initResponse = await fetch(initUrl.toString(), { method: 'POST' });
    const initData = await initResponse.json();

    if (initData.error) {
      throw new Error(`Facebook init error: ${initData.error.message}`);
    }

    const uploadSessionId = initData.upload_session_id;

    // Get initial offsets from Facebook's init response
    let startOffset = parseInt(initData.start_offset, 10);
    let endOffset = parseInt(initData.end_offset, 10);

    console.log(`Uploading ${videoBuffer.byteLength} bytes starting at offset ${startOffset}`);

    while (startOffset < videoBuffer.byteLength) {
      // Create chunk using Facebook's provided offsets and convert to Buffer
      const chunk = Buffer.from(videoBuffer.slice(startOffset, endOffset));
      
      console.log(`Uploading chunk: start_offset=${startOffset}, end_offset=${endOffset}, size=${chunk.byteLength}`);

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

      if (transferData.error) {
        throw new Error(`Facebook transfer error at offset ${startOffset}: ${transferData.error.message}`);
      }

      // Use Facebook's returned offsets for next iteration
      startOffset = parseInt(transferData.start_offset, 10);
      endOffset = parseInt(transferData.end_offset, 10);
    }

    console.log('All chunks uploaded successfully');

    // Finalize upload
    const finalizeUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    finalizeUrl.searchParams.set('access_token', accessToken);
    finalizeUrl.searchParams.set('upload_phase', 'finish');
    finalizeUrl.searchParams.set('upload_session_id', uploadSessionId);
    finalizeUrl.searchParams.set('description', description);

    const finalizeResponse = await fetch(finalizeUrl.toString(), { method: 'POST' });
    const finalizeData = await finalizeResponse.json();

    if (finalizeData.error) {
      throw new Error(`Facebook finalize error: ${finalizeData.error.message}`);
    }

    const postId = finalizeData.id;
    const postUrl = `https://facebook.com/${postId}`;

    console.log('Facebook post success:', postId);

    return {
      platform: 'facebook',
      success: true,
      postId,
      url: postUrl
    };
  } catch (error) {
    console.error('Facebook post error:', error);
    return {
      platform: 'facebook',
      success: false,
      error: error.message
    };
  }
}

/**
 * Post to Instagram with Cloudinary Video Transcoding
 * 
 * Instagram requires MP4 with H.264 video codec and AAC audio codec.
 * This function uses Cloudinary to automatically transcode videos to meet these requirements.
 * 
 * Required environment variables:
 * - CLOUDINARY_CLOUD_NAME
 * - CLOUDINARY_API_KEY
 * - CLOUDINARY_API_SECRET
 */
async function postToInstagram(userId, video, connection, accessToken, title, description) {
  let transcodedFileName = null;
  
  try {
    // Check if transcoder service is configured
    const TRANSCODER_URL = process.env.TRANSCODER_URL;
    if (!TRANSCODER_URL) {
      throw new Error(
        'Instagram requires video transcoding. Please configure TRANSCODER_URL environment variable.'
      );
    }

    if (!video.onedrive_file_id) {
      throw new Error('Video has no OneDrive ID');
    }

    console.log('Starting Instagram post with Railway transcoding service');

    // Get OneDrive download URL
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_file_id}/content`;
    
    // Call transcoding service with OneDrive URL (55s timeout to stay under Netlify 60s limit)
    console.log('Sending video to transcoding service:', TRANSCODER_URL);
    console.log('OneDrive download URL:', downloadUrl);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 second timeout
    
    let transcodeResponse;
    try {
      transcodeResponse = await fetch(`${TRANSCODER_URL}/transcode`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${onedriveToken}` // Pass OneDrive token for download
        },
        body: JSON.stringify({ videoUrl: downloadUrl }),
        signal: controller.signal
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error('Transcoding request timed out after 55s');
        throw new Error('Video transcoding timed out. Try a smaller video (under 20MB) or wait and retry.');
      }
      console.error('Transcoding fetch error:', fetchError);
      throw new Error(`Transcoding service unavailable: ${fetchError.message}`);
    }
    clearTimeout(timeoutId);

    if (!transcodeResponse.ok) {
      const errorText = await transcodeResponse.text();
      console.error('Transcoding failed:', transcodeResponse.status, errorText);
      throw new Error(`Transcoding service error: ${transcodeResponse.status} ${errorText.substring(0, 100)}`);
    }

    const transcodeData = await transcodeResponse.json();
    transcodedFileName = transcodeData.fileName;
    const videoUrl = transcodeData.transcodedUrl;
    
    console.log('Transcoded video URL:', videoUrl);

    // Create Instagram media container
    const createUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media`);
    createUrl.searchParams.set('access_token', accessToken);
    createUrl.searchParams.set('video_url', videoUrl);
    createUrl.searchParams.set('media_type', 'REELS');
    createUrl.searchParams.set('caption', description.substring(0, 2200));

    const createResponse = await fetch(createUrl.toString(), { method: 'POST' });
    const createData = await createResponse.json();

    if (createData.error) {
      console.error('Instagram container creation error:', createData.error);
      throw new Error(`Instagram container creation error: ${createData.error.message} (Code: ${createData.error.code})`);
    }

    const containerId = createData.id;
    console.log('Instagram container created:', containerId);

    // Wait for Instagram processing
    let isReady = false;
    let statusCheckCount = 0;
    const maxChecks = 20; // Increased timeout since transcoding may take longer

    while (!isReady && statusCheckCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusUrl = new URL(`https://graph.facebook.com/v18.0/${containerId}`);
      statusUrl.searchParams.set('access_token', accessToken);
      statusUrl.searchParams.set('fields', 'status_code,status');

      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json();

      console.log(`Instagram processing status (check ${statusCheckCount + 1}/${maxChecks}):`, JSON.stringify(statusData));

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
      } else if (statusData.status_code === 'ERROR') {
        console.error('Instagram processing error:', JSON.stringify(statusData));
        const errorMessage = statusData.error_message || statusData.status || 'Unknown error';
        throw new Error(`Instagram processing failed: ${errorMessage}`);
      }
      
      statusCheckCount++;
    }

    if (!isReady) {
      throw new Error('Instagram processing timeout - video may still be processing. Try again in a few minutes.');
    }

    // Publish to Instagram
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    publishUrl.searchParams.set('creation_id', containerId);

    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      console.error('Instagram publish error:', publishData.error);
      throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    const postId = publishData.id;
    const postUrl = `https://instagram.com/p/${postId}`;

    console.log('Instagram post success:', postId);

    // Clean up transcoded file from Supabase (optional - can keep for later use)
    if (transcodedFileName) {
      try {
        console.log('Cleaning up transcoded file:', transcodedFileName);
        const { error } = await supabase.storage
          .from('social-media-temp')
          .remove([transcodedFileName]);
        if (error) {
          console.warn('Failed to cleanup transcoded file:', error.message);
        } else {
          console.log('Transcoded file cleanup successful');
        }
        // Don't fail the whole operation if cleanup fails
      } catch (cleanupError) {
        console.warn('Failed to cleanup transcoded file:', cleanupError.message);
      }
    }

    return {
      platform: 'instagram',
      success: true,
      postId,
      url: postUrl
    };
  } catch (error) {
    console.error('Instagram post error:', error);
    
    // Cleanup transcoded file on error
    if (transcodedFileName) {
      try {
        console.log('Cleaning up transcoded file after error:', transcodedFileName);
        const { error } = await supabase.storage
          .from('social-media-temp')
          .remove([transcodedFileName]);
        if (error) {
          console.warn('Failed to cleanup transcoded file on error:', error.message);
        } else {
          console.log('Transcoded file cleanup after error successful');
        }
      } catch (cleanupError) {
        console.warn('Failed to cleanup transcoded file on error:', cleanupError.message);
      }
    }
    
    return {
      platform: 'instagram',
      success: false,
      error: error.message
    };
  }
}
