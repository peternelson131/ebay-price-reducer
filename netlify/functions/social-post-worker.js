/**
 * Social Post Worker Endpoint
 * Called by Railway BullMQ worker to process scheduled posts
 * 
 * Uses webhook secret auth (not user auth)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyWebhookSecret } = require('./utils/auth');
const InstagramWorker = require('./utils/social-worker-instagram');
const YouTubeWorker = require('./utils/social-worker-youtube');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform workers (lazy init)
let WORKERS = null;
function getWorkers() {
  if (!WORKERS) {
    WORKERS = {
      instagram: new InstagramWorker(),
      youtube: new YouTubeWorker()
    };
  }
  return WORKERS;
}

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  // Verify webhook secret
  const authResult = verifyWebhookSecret(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }
  
  try {
    const { postId, userId, videoId, caption, platforms } = JSON.parse(event.body);
    
    if (!postId || !userId || !videoId || !platforms) {
      return errorResponse(400, 'Missing required fields', headers);
    }
    
    console.log(`[Worker] Processing post ${postId} for platforms: ${platforms.join(', ')}`);
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('id, social_ready_url, duration_seconds')
      .eq('id', videoId)
      .single();
    
    if (videoError || !video || !video.social_ready_url) {
      return errorResponse(404, 'Video not found or not ready', headers);
    }
    
    const workers = getWorkers();
    const results = { platforms: {}, overallSuccess: true };
    
    // Process each platform
    for (const platform of platforms) {
      const worker = workers[platform];
      
      if (!worker) {
        results.platforms[platform] = { success: false, error: 'Platform not supported' };
        results.overallSuccess = false;
        continue;
      }
      
      try {
        // Use worker.getAccount() which handles token refresh automatically
        console.log(`[Worker] Getting account for ${platform} (with token refresh if needed)...`);
        const account = await worker.getAccount(userId);
        
        console.log(`[Worker] Posting to ${platform}...`);
        const postResult = await worker.postToPlatform(
          account,
          { caption: caption, id: postId },
          {
            id: video.id,
            url: video.social_ready_url,
            duration: video.duration_seconds
          }
        );
        
        if (postResult.success) {
          results.platforms[platform] = {
            success: true,
            platformPostId: postResult.platformPostId,
            platformUrl: postResult.platformPostUrl
          };
          
          await supabase.from('post_results').insert({
            post_id: postId,
            social_account_id: account.id,
            platform: platform,
            success: true,
            platform_post_id: postResult.platformPostId,
            platform_post_url: postResult.platformPostUrl,
            posted_at: new Date().toISOString()
          });
          
          console.log(`[Worker] ${platform}: SUCCESS`);
        } else {
          throw new Error(postResult.error || 'Posting failed');
        }
        
      } catch (platformError) {
        console.error(`[Worker] ${platform} error:`, platformError.message);
        
        results.platforms[platform] = {
          success: false,
          error: platformError.message
        };
        results.overallSuccess = false;
        
        // Try to store error result (account may not be available if getAccount failed)
        try {
          await supabase.from('post_results').insert({
            post_id: postId,
            social_account_id: null,
            platform: platform,
            success: false,
            error_message: platformError.message,
            posted_at: new Date().toISOString()
          });
        } catch (dbError) {
          console.error(`[Worker] Failed to store error result:`, dbError.message);
        }
      }
    }
    
    // Update post status
    const finalStatus = results.overallSuccess ? 'posted' : 'failed';
    await supabase
      .from('social_posts')
      .update({
        status: finalStatus,
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);
    
    return successResponse({
      postId,
      status: finalStatus,
      results: results.platforms,
      overallSuccess: results.overallSuccess
    }, headers);
    
  } catch (error) {
    console.error('[Worker] Error:', error);
    return errorResponse(500, error.message, headers);
  }
};
