/**
 * Social Post - Unified endpoint for posting to multiple social platforms
 * POST /social-post - Post a video to selected platforms (YouTube, Facebook, Instagram)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { getValidAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const META_APP_ID = process.env.META_APP_ID;
const META_APP_SECRET = process.env.META_APP_SECRET;

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

    const results = [];

    // Post to YouTube if requested
    if (platforms.includes('youtube')) {
      try {
        const youtubeResult = await postToYouTube(userId, video, videoTitle, videoDescription);
        results.push(youtubeResult);
        
        // Record in database
        await supabase.from('scheduled_posts').insert({
          user_id: userId,
          video_id: videoId,
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
        console.error('YouTube post error:', error);
        results.push({
          platform: 'youtube',
          success: false,
          error: error.message
        });
        
        await supabase.from('scheduled_posts').insert({
          user_id: userId,
          video_id: videoId,
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
            video_id: videoId,
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
          console.log('Meta token expiring soon, attempting refresh');
          const newToken = await refreshMetaToken(userId, metaConnection.access_token);
          if (newToken) {
            accessToken = newToken;
          }
        }

        // Post to Facebook if requested
        if (metaPlatforms.includes('facebook')) {
          try {
            const fbResult = await postToFacebook(userId, video, metaConnection, accessToken, videoTitle, videoDescription);
            results.push(fbResult);
            
            await supabase.from('scheduled_posts').insert({
              user_id: userId,
              video_id: videoId,
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
            console.error('Facebook post error:', error);
            results.push({
              platform: 'facebook',
              success: false,
              error: error.message
            });
            
            await supabase.from('scheduled_posts').insert({
              user_id: userId,
              video_id: videoId,
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
              video_id: videoId,
              platform: 'instagram',
              scheduled_for: new Date().toISOString(),
              title: videoTitle,
              description: videoDescription,
              status: 'failed',
              error_message: 'Instagram account not linked to Facebook Page'
            });
          } else {
            try {
              const igResult = await postToInstagram(userId, video, metaConnection, accessToken, videoTitle, videoDescription);
              results.push(igResult);
              
              await supabase.from('scheduled_posts').insert({
                user_id: userId,
                video_id: videoId,
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
              console.error('Instagram post error:', error);
              results.push({
                platform: 'instagram',
                success: false,
                error: error.message
              });
              
              await supabase.from('scheduled_posts').insert({
                user_id: userId,
                video_id: videoId,
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

    return successResponse({
      success: results.some(r => r.success),
      results,
      message: `Posted to ${results.filter(r => r.success).length}/${results.length} platforms`
    }, headers);

  } catch (error) {
    console.error('Social post error:', error);
    return errorResponse(500, error.message || 'Failed to post to social media', headers);
  }
};

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
    
    if (!video.onedrive_id) {
      return {
        platform: 'youtube',
        success: false,
        error: 'Video has no OneDrive ID'
      };
    }
    
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
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
    if (!video.onedrive_id) {
      throw new Error('Video has no OneDrive ID');
    }
    
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
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

    // Transfer video bytes
    const transferUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    transferUrl.searchParams.set('access_token', accessToken);
    transferUrl.searchParams.set('upload_phase', 'transfer');
    transferUrl.searchParams.set('upload_session_id', uploadSessionId);
    transferUrl.searchParams.set('start_offset', '0');

    const transferResponse = await fetch(transferUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: videoBuffer
    });

    const transferData = await transferResponse.json();

    if (transferData.error) {
      throw new Error(`Facebook transfer error: ${transferData.error.message}`);
    }

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
 * Post to Instagram
 */
async function postToInstagram(userId, video, connection, accessToken, title, description) {
  try {
    let videoUrl;
    let tempStoragePath = null;

    // Try OneDrive share link first
    try {
      const { accessToken: onedriveToken } = await getValidAccessToken(userId);
      
      const shareUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/createLink`;
      const shareResponse = await fetch(shareUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${onedriveToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'view',
          scope: 'anonymous'
        })
      });

      if (shareResponse.ok) {
        const shareData = await shareResponse.json();
        videoUrl = shareData.link?.webUrl;
        
        if (videoUrl) {
          videoUrl = videoUrl.replace('redir', 'download');
          console.log('Using OneDrive share link:', videoUrl);
        }
      }
    } catch (error) {
      console.warn('OneDrive share link failed, will try Supabase Storage:', error.message);
    }

    // If OneDrive share didn't work, upload to Supabase Storage
    if (!videoUrl) {
      console.log('Uploading to Supabase Storage for Instagram');
      
      if (!video.onedrive_id) {
        throw new Error('Video has no OneDrive ID');
      }
      
      const { accessToken: onedriveToken } = await getValidAccessToken(userId);
      
      const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
      const videoResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${onedriveToken}` }
      });

      if (!videoResponse.ok) {
        const errorText = await videoResponse.text();
        console.error('OneDrive download failed for Instagram:', videoResponse.status, errorText);
        throw new Error(`Failed to download video from OneDrive: ${videoResponse.status} ${errorText.substring(0, 100)}`);
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      
      const fileName = `temp/${userId}/${Date.now()}-${video.filename}`;
      tempStoragePath = fileName;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('social-media-temp')
        .upload(fileName, videoBuffer, {
          contentType: 'video/mp4',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase.storage
        .from('social-media-temp')
        .getPublicUrl(fileName);

      videoUrl = urlData.publicUrl;
      console.log('Using Supabase Storage URL:', videoUrl);
    }

    // Create Instagram media container
    const createUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media`);
    createUrl.searchParams.set('access_token', accessToken);
    createUrl.searchParams.set('video_url', videoUrl);
    createUrl.searchParams.set('media_type', 'REELS');
    createUrl.searchParams.set('caption', description.substring(0, 2200));

    const createResponse = await fetch(createUrl.toString(), { method: 'POST' });
    const createData = await createResponse.json();

    if (createData.error) {
      throw new Error(`Instagram container creation error: ${createData.error.message}`);
    }

    const containerId = createData.id;
    console.log('Instagram container created:', containerId);

    // Wait for processing
    let isReady = false;
    let statusCheckCount = 0;
    const maxChecks = 12;

    while (!isReady && statusCheckCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const statusUrl = new URL(`https://graph.facebook.com/v18.0/${containerId}`);
      statusUrl.searchParams.set('access_token', accessToken);
      statusUrl.searchParams.set('fields', 'status_code');

      const statusResponse = await fetch(statusUrl.toString());
      const statusData = await statusResponse.json();

      if (statusData.status_code === 'FINISHED') {
        isReady = true;
      } else if (statusData.status_code === 'ERROR') {
        throw new Error('Instagram processing failed');
      }
      
      statusCheckCount++;
    }

    if (!isReady) {
      throw new Error('Instagram processing timeout - video may still be processing');
    }

    // Publish
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    publishUrl.searchParams.set('creation_id', containerId);

    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    const postId = publishData.id;
    const postUrl = `https://instagram.com/p/${postId}`;

    console.log('Instagram post success:', postId);

    // Clean up temp storage
    if (tempStoragePath) {
      console.log('Cleaning up temp storage file:', tempStoragePath);
      try {
        await supabase.storage
          .from('social-media-temp')
          .remove([tempStoragePath]);
        console.log('Cleaned up temp storage file successfully');
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError.message);
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
    
    // Cleanup temp storage on error
    if (typeof tempStoragePath !== 'undefined' && tempStoragePath) {
      console.log('Cleaning up temp storage file after error:', tempStoragePath);
      try {
        await supabase.storage
          .from('social-media-temp')
          .remove([tempStoragePath]);
        console.log('Cleaned up temp storage file after error');
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file on error:', cleanupError.message);
      }
    }
    
    return {
      platform: 'instagram',
      success: false,
      error: error.message
    };
  }
}
