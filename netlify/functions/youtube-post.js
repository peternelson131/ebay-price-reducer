/**
 * YouTube Post - Upload a video to YouTube
 * POST /youtube-post - Manually trigger a post
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { getAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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
    const { videoId, title, description } = JSON.parse(event.body || '{}');

    if (!videoId) {
      return errorResponse(400, 'videoId is required', headers);
    }

    // Get YouTube connection
    const { data: connection, error: connError } = await supabase
      .from('social_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'youtube')
      .single();

    if (!connection) {
      return errorResponse(400, 'YouTube not connected', headers);
    }

    // Check if token needs refresh
    let accessToken = connection.access_token;
    if (new Date(connection.token_expires_at) < new Date(Date.now() + 5 * 60 * 1000)) {
      // Token expires in less than 5 minutes, refresh it
      accessToken = await refreshYouTubeToken(userId, connection.refresh_token);
      if (!accessToken) {
        return errorResponse(400, 'Failed to refresh YouTube token. Please reconnect.', headers);
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

    // Get video file from OneDrive
    const onedriveToken = await getAccessToken(userId);
    if (!onedriveToken) {
      return errorResponse(400, 'OneDrive not connected', headers);
    }

    // Download video content
    const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${video.onedrive_id}/content`;
    const videoResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${onedriveToken}` }
    });

    if (!videoResponse.ok) {
      return errorResponse(500, 'Failed to download video from OneDrive', headers);
    }

    const videoBuffer = await videoResponse.arrayBuffer();
    const videoBytes = new Uint8Array(videoBuffer);

    // Prepare metadata
    const videoTitle = title || video.sourced_products?.video_title || video.sourced_products?.title || video.filename;
    const videoDescription = description || 
      `Check out this product: https://amazon.com/dp/${video.sourced_products?.asin || ''}`;

    // Upload to YouTube using resumable upload
    const youtubeVideoId = await uploadToYouTube(accessToken, videoBytes, {
      title: videoTitle.substring(0, 100), // YouTube title limit
      description: videoDescription.substring(0, 5000),
      privacyStatus: 'public',
      madeForKids: false
    });

    if (!youtubeVideoId) {
      // Create failed post record
      await supabase.from('scheduled_posts').insert({
        user_id: userId,
        video_id: videoId,
        platform: 'youtube',
        scheduled_for: new Date().toISOString(),
        title: videoTitle,
        description: videoDescription,
        status: 'failed',
        error_message: 'Upload failed'
      });
      
      return errorResponse(500, 'Failed to upload to YouTube', headers);
    }

    // Create success post record
    const youtubeUrl = `https://youtube.com/shorts/${youtubeVideoId}`;
    
    await supabase.from('scheduled_posts').insert({
      user_id: userId,
      video_id: videoId,
      platform: 'youtube',
      scheduled_for: new Date().toISOString(),
      title: videoTitle,
      description: videoDescription,
      status: 'posted',
      posted_at: new Date().toISOString(),
      platform_post_id: youtubeVideoId,
      platform_url: youtubeUrl
    });

    return successResponse({
      success: true,
      youtubeVideoId,
      youtubeUrl,
      message: 'Video posted to YouTube!'
    }, headers);

  } catch (error) {
    console.error('YouTube post error:', error);
    return errorResponse(500, error.message || 'Failed to post to YouTube', headers);
  }
};

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

    // Update stored token
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
    // Step 1: Initialize resumable upload
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
            categoryId: '22' // People & Blogs
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

    // Step 2: Upload video content
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
