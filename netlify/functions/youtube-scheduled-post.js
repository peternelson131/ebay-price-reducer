/**
 * YouTube Scheduled Post - Background job to post scheduled videos
 * Runs via Netlify Scheduled Functions (hourly)
 * 
 * Schedule configuration in netlify.toml:
 * [functions."youtube-scheduled-post"]
 * schedule = "0 * * * *"
 */

const { createClient } = require('@supabase/supabase-js');
const { getAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

exports.handler = async (event, context) => {
  console.log('YouTube scheduled post job started');

  try {
    // Get all active YouTube schedules
    const { data: schedules, error: scheduleError } = await supabase
      .from('posting_schedules')
      .select('*, social_connections!inner(*)')
      .eq('platform', 'youtube')
      .eq('is_active', true);

    if (scheduleError || !schedules?.length) {
      console.log('No active YouTube schedules found');
      return { statusCode: 200, body: 'No active schedules' };
    }

    const now = new Date();
    let postsProcessed = 0;

    for (const schedule of schedules) {
      try {
        // Check if it's time to post for this user
        const userNow = getTimeInTimezone(now, schedule.timezone);
        const [scheduleHour, scheduleMinute] = schedule.post_time.split(':').map(Number);
        
        // Check if current hour matches scheduled hour (within the hour window)
        if (userNow.getHours() !== scheduleHour) {
          continue;
        }

        // Check if we already posted today
        const todayStart = new Date(userNow);
        todayStart.setHours(0, 0, 0, 0);
        
        const { data: existingPost } = await supabase
          .from('scheduled_posts')
          .select('id')
          .eq('user_id', schedule.user_id)
          .eq('platform', 'youtube')
          .gte('scheduled_for', todayStart.toISOString())
          .limit(1);

        if (existingPost?.length > 0) {
          console.log(`User ${schedule.user_id} already has a post today, skipping`);
          continue;
        }

        // Find a video to post (one that hasn't been posted yet)
        const { data: videos } = await supabase
          .from('product_videos')
          .select(`
            id, filename, onedrive_id,
            sourced_products(id, title, asin, video_title, owner_id)
          `)
          .eq('user_id', schedule.user_id)
          .eq('upload_status', 'complete')
          .order('created_at', { ascending: true });

        if (!videos?.length) {
          console.log(`No videos found for user ${schedule.user_id}`);
          continue;
        }

        // Find a video not yet posted to YouTube
        const { data: postedVideoIds } = await supabase
          .from('scheduled_posts')
          .select('video_id')
          .eq('user_id', schedule.user_id)
          .eq('platform', 'youtube')
          .eq('status', 'posted');

        const postedSet = new Set((postedVideoIds || []).map(p => p.video_id));
        const unpostedVideo = videos.find(v => !postedSet.has(v.id));

        if (!unpostedVideo) {
          console.log(`All videos already posted for user ${schedule.user_id}`);
          continue;
        }

        console.log(`Posting video ${unpostedVideo.id} for user ${schedule.user_id}`);

        // Get fresh access token
        let accessToken = schedule.social_connections.access_token;
        const tokenExpiry = new Date(schedule.social_connections.token_expires_at);
        
        if (tokenExpiry < new Date(Date.now() + 5 * 60 * 1000)) {
          accessToken = await refreshYouTubeToken(
            schedule.user_id, 
            schedule.social_connections.refresh_token
          );
          if (!accessToken) {
            console.error(`Token refresh failed for user ${schedule.user_id}`);
            continue;
          }
        }

        // Download video from OneDrive
        const onedriveToken = await getAccessToken(schedule.user_id);
        if (!onedriveToken) {
          console.error(`OneDrive token not found for user ${schedule.user_id}`);
          continue;
        }

        const downloadUrl = `https://graph.microsoft.com/v1.0/me/drive/items/${unpostedVideo.onedrive_id}/content`;
        const videoResponse = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${onedriveToken}` }
        });

        if (!videoResponse.ok) {
          console.error(`Failed to download video ${unpostedVideo.id}`);
          continue;
        }

        const videoBuffer = await videoResponse.arrayBuffer();
        const videoBytes = new Uint8Array(videoBuffer);

        // Prepare metadata
        const product = unpostedVideo.sourced_products;
        const videoTitle = product?.video_title || product?.title || unpostedVideo.filename;
        const videoDescription = product?.asin 
          ? `Check out this product: https://amazon.com/dp/${product.asin}`
          : 'Product review video';

        // Upload to YouTube
        const youtubeVideoId = await uploadToYouTube(accessToken, videoBytes, {
          title: videoTitle.substring(0, 100),
          description: videoDescription.substring(0, 5000),
          privacyStatus: 'public',
          madeForKids: false
        });

        // Record the result
        await supabase.from('scheduled_posts').insert({
          user_id: schedule.user_id,
          video_id: unpostedVideo.id,
          platform: 'youtube',
          scheduled_for: now.toISOString(),
          title: videoTitle,
          description: videoDescription,
          status: youtubeVideoId ? 'posted' : 'failed',
          posted_at: youtubeVideoId ? new Date().toISOString() : null,
          platform_post_id: youtubeVideoId || null,
          platform_url: youtubeVideoId ? `https://youtube.com/shorts/${youtubeVideoId}` : null,
          error_message: youtubeVideoId ? null : 'Upload failed'
        });

        if (youtubeVideoId) {
          console.log(`Successfully posted video ${unpostedVideo.id} as ${youtubeVideoId}`);
          postsProcessed++;
        }

      } catch (userError) {
        console.error(`Error processing schedule for user ${schedule.user_id}:`, userError);
      }
    }

    console.log(`YouTube scheduled post job completed. Posts processed: ${postsProcessed}`);
    return { 
      statusCode: 200, 
      body: JSON.stringify({ success: true, postsProcessed }) 
    };

  } catch (error) {
    console.error('YouTube scheduled post job error:', error);
    return { statusCode: 500, body: error.message };
  }
};

function getTimeInTimezone(date, timezone) {
  return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
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
    if (data.error) return null;

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
      console.error('YouTube init error:', await initResponse.text());
      return null;
    }

    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) return null;

    // Upload video
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
      console.error('YouTube upload error:', await uploadResponse.text());
      return null;
    }

    const result = await uploadResponse.json();
    return result.id;
  } catch (error) {
    console.error('YouTube upload error:', error);
    return null;
  }
}
