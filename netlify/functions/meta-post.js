/**
 * Meta Post - Upload video to Facebook/Instagram
 * POST /meta-post - Manually post a video to Meta platforms
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { getValidAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
      return errorResponse(400, 'platforms array is required', headers);
    }

    // Get Meta connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'meta')
      .single();

    if (!connection) {
      return errorResponse(400, 'Meta not connected', headers);
    }

    // Check if token needs refresh (Meta uses long-lived tokens, but they do expire)
    let accessToken = connection.access_token;
    const tokenExpiresAt = new Date(connection.token_expires_at);
    const now = new Date();
    
    if (tokenExpiresAt < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
      // Token expires in less than 7 days, refresh it
      console.log('Meta token expiring soon, attempting refresh');
      const newToken = await refreshMetaToken(userId, connection.access_token);
      if (newToken) {
        accessToken = newToken;
      } else {
        console.warn('Failed to refresh Meta token, continuing with existing token');
      }
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

    // Post to Facebook if requested
    if (platforms.includes('facebook')) {
      try {
        const fbResult = await postToFacebook(userId, video, connection, accessToken, videoTitle, videoDescription);
        results.push(fbResult);
        
        // Record in database
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
    if (platforms.includes('instagram')) {
      if (!connection.instagram_account_id) {
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
          const igResult = await postToInstagram(userId, video, connection, accessToken, videoTitle, videoDescription);
          results.push(igResult);
          
          // Record in database
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

    return successResponse({
      success: results.some(r => r.success),
      results
    }, headers);

  } catch (error) {
    console.error('Meta post error:', error);
    return errorResponse(500, error.message || 'Failed to post to Meta', headers);
  }
};

/**
 * Refresh Meta long-lived token
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
    const expiresIn = data.expires_in || 5184000; // Default to 60 days
    const newExpiresAt = new Date(Date.now() + (expiresIn * 1000)).toISOString();

    // Update database
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
 * Post video to Facebook Page
 */
async function postToFacebook(userId, video, connection, accessToken, title, description) {
  try {
    // Get OneDrive access token
    const { accessToken: onedriveToken } = await getValidAccessToken(userId);
    
    // Download video from OneDrive
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      throw new Error('Failed to download video from OneDrive');
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    
    // Upload to Facebook using resumable upload
    // Step 1: Initialize upload session
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

    // Step 2: Transfer video bytes
    const transferUrl = new URL(`https://graph.facebook.com/v18.0/${connection.account_id}/videos`);
    transferUrl.searchParams.set('access_token', accessToken);
    transferUrl.searchParams.set('upload_phase', 'transfer');
    transferUrl.searchParams.set('upload_session_id', uploadSessionId);
    transferUrl.searchParams.set('start_offset', '0');

    const transferResponse = await fetch(transferUrl.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: videoBuffer
    });

    const transferData = await transferResponse.json();

    if (transferData.error) {
      throw new Error(`Facebook transfer error: ${transferData.error.message}`);
    }

    // Step 3: Finalize upload
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
 * Post video to Instagram Reels
 */
async function postToInstagram(userId, video, connection, accessToken, title, description) {
  try {
    // Instagram requires a publicly accessible video URL
    // Strategy: Try OneDrive share link first, if that fails, upload to Supabase Storage
    
    let videoUrl;
    let tempStoragePath = null;

    // Try OneDrive public share link first
    try {
      const { accessToken: onedriveToken } = await getValidAccessToken(userId);
      
      // Create sharing link
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
          // Convert OneDrive share link to direct download link
          // OneDrive share links need to be converted to direct download URLs
          videoUrl = videoUrl.replace('redir', 'download');
          console.log('Using OneDrive share link:', videoUrl);
        }
      }
    } catch (error) {
      console.warn('OneDrive share link failed, will try Supabase Storage:', error.message);
    }

    // If OneDrive share didn't work, upload to Supabase Storage temp bucket
    if (!videoUrl) {
      console.log('Uploading to Supabase Storage for Instagram');
      
      const { accessToken: onedriveToken } = await getValidAccessToken(userId);
      
      // Download video from OneDrive
      const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
      const videoResponse = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${onedriveToken}` }
      });

      if (!videoResponse.ok) {
        throw new Error('Failed to download video from OneDrive');
      }

      const videoBuffer = await videoResponse.arrayBuffer();
      
      // Upload to Supabase Storage
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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('social-media-temp')
        .getPublicUrl(fileName);

      videoUrl = urlData.publicUrl;
      console.log('Using Supabase Storage URL:', videoUrl);
    }

    // Step 1: Create Instagram media container
    const createUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media`);
    createUrl.searchParams.set('access_token', accessToken);
    createUrl.searchParams.set('video_url', videoUrl);
    createUrl.searchParams.set('media_type', 'REELS');
    createUrl.searchParams.set('caption', description.substring(0, 2200)); // Instagram caption limit

    const createResponse = await fetch(createUrl.toString(), { method: 'POST' });
    const createData = await createResponse.json();

    if (createData.error) {
      throw new Error(`Instagram container creation error: ${createData.error.message}`);
    }

    const containerId = createData.id;
    console.log('Instagram container created:', containerId);

    // Step 2: Wait for processing (Instagram needs time to download and process the video)
    // Poll for status, max 60 seconds
    let isReady = false;
    let statusCheckCount = 0;
    const maxChecks = 12; // 12 checks * 5 seconds = 60 seconds

    while (!isReady && statusCheckCount < maxChecks) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      
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

    // Step 3: Publish the container
    const publishUrl = new URL(`https://graph.facebook.com/v18.0/${connection.instagram_account_id}/media_publish`);
    publishUrl.searchParams.set('access_token', accessToken);
    publishUrl.searchParams.set('creation_id', containerId);

    const publishResponse = await fetch(publishUrl.toString(), { method: 'POST' });
    const publishData = await publishResponse.json();

    if (publishData.error) {
      throw new Error(`Instagram publish error: ${publishData.error.message}`);
    }

    const postId = publishData.id;
    const postUrl = `https://instagram.com/p/${postId}`; // Note: This might not be the exact permalink format

    console.log('Instagram post success:', postId);

    // Clean up temp storage file if we created one
    if (tempStoragePath) {
      try {
        await supabase.storage
          .from('social-media-temp')
          .remove([tempStoragePath]);
        console.log('Cleaned up temp storage file');
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file:', cleanupError);
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
    
    // Clean up temp storage on error
    if (tempStoragePath) {
      try {
        await supabase.storage
          .from('social-media-temp')
          .remove([tempStoragePath]);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temp file on error:', cleanupError);
      }
    }
    
    return {
      platform: 'instagram',
      success: false,
      error: error.message
    };
  }
}
