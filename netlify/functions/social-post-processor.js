/**
 * Scheduled Post Processor
 * Netlify Scheduled Function (runs every minute)
 * 
 * Schedule in netlify.toml:
 * [[plugins]]
 * package = "@netlify/plugin-functions-core"
 *   [plugins.inputs]
 *   schedule = "* * * * *"  # Every minute
 * 
 * Processes posts where:
 * - status = 'scheduled'
 * - scheduled_at <= NOW()
 * 
 * Updates status through lifecycle:
 * scheduled → processing → posted/failed
 */

const { createClient } = require('@supabase/supabase-js');
const { verifyWebhookSecret } = require('./utils/auth');
const InstagramWorker = require('./utils/social-worker-instagram');
const YouTubeWorker = require('./utils/social-worker-youtube');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Platform workers (lazy init to avoid env var issues)
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

/**
 * Process a single post to all target platforms
 * @param {Object} post - Post object from database
 * @returns {Object} Processing results
 */
async function processPost(post) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const results = {
    postId: post.id,
    platforms: {},
    overallSuccess: true
  };
  
  console.log(`[Processor] Processing post ${post.id} for platforms: ${post.platforms.join(', ')}`);
  
  // Mark as processing
  await supabase
    .from('social_posts')
    .update({
      status: 'processing',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', post.id);
  
  // Get video details
  const { data: video, error: videoError } = await supabase
    .from('product_videos')
    .select('*')
    .eq('id', post.video_id)
    .single();
  
  if (videoError || !video) {
    console.error(`[Processor] Video not found for post ${post.id}`);
    
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id);
    
    return {
      ...results,
      overallSuccess: false,
      error: 'Video not found'
    };
  }
  
  // Process each platform
  for (const platform of post.platforms) {
    try {
      console.log(`[Processor] Posting to ${platform}...`);
      
      const workers = getWorkers();
      const worker = workers[platform];
      if (!worker) {
        throw new Error(`No worker available for platform: ${platform}`);
      }
      
      // Get account for this platform
      const account = await worker.getAccount(post.user_id);
      
      // Post to platform
      const result = await worker.postToPlatform(account, post, video);
      
      // Store result in database
      await supabase
        .from('post_results')
        .insert({
          post_id: post.id,
          social_account_id: account.id,
          platform: platform,
          success: result.success,
          error_message: result.error || null,
          error_code: result.code || null,
          platform_post_id: result.platformPostId || null,
          platform_post_url: result.platformPostUrl || null,
          metadata: result.metadata || null,
          posted_at: new Date().toISOString()
        });
      
      results.platforms[platform] = {
        success: result.success,
        postId: result.platformPostId,
        postUrl: result.platformPostUrl,
        error: result.error
      };
      
      if (!result.success) {
        results.overallSuccess = false;
      }
      
      console.log(`[Processor] ${platform}: ${result.success ? 'SUCCESS' : 'FAILED'}`);
      
    } catch (error) {
      console.error(`[Processor] Error posting to ${platform}:`, error);
      
      // Store error result
      try {
        await supabase
          .from('post_results')
          .insert({
            post_id: post.id,
            social_account_id: null,
            platform: platform,
            success: false,
            error_message: error.message,
            error_code: 'WORKER_ERROR',
            posted_at: new Date().toISOString()
          });
      } catch (dbError) {
        console.error(`[Processor] Failed to store error result:`, dbError);
      }
      
      results.platforms[platform] = {
        success: false,
        error: error.message
      };
      
      results.overallSuccess = false;
    }
  }
  
  // Update post status based on results
  const finalStatus = results.overallSuccess ? 'posted' : 'failed';
  
  await supabase
    .from('social_posts')
    .update({
      status: finalStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', post.id);
  
  console.log(`[Processor] Post ${post.id} complete: ${finalStatus}`);
  
  return results;
}

/**
 * Main handler - processes all due posts
 */
exports.handler = async (event, context) => {
  console.log('[Processor] Scheduled post processor triggered');
  console.log('[Processor] Event type:', event.httpMethod || 'SCHEDULED');
  
  // For Netlify scheduled functions, skip webhook auth
  // Scheduled functions are triggered by Netlify internally (not HTTP)
  const isScheduledTrigger = !event.httpMethod || event.httpMethod === 'SCHEDULE';
  
  if (!isScheduledTrigger) {
    // Verify webhook secret for manual HTTP triggers
    const authResult = verifyWebhookSecret(event);
    if (!authResult.success) {
      console.error('[Processor] Unauthorized access attempt');
      return {
        statusCode: authResult.statusCode,
        body: JSON.stringify({ error: authResult.error })
      };
    }
  }
  
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Find posts that are due for processing
    const now = new Date().toISOString();
    const { data: duePosts, error: queryError } = await supabase
      .from('social_posts')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .order('scheduled_at', { ascending: true })
      .limit(10); // Process max 10 posts per run
    
    if (queryError) {
      console.error('[Processor] Error querying due posts:', queryError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to query due posts' })
      };
    }
    
    if (!duePosts || duePosts.length === 0) {
      console.log('[Processor] No posts due for processing');
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'No posts due',
          processed: 0
        })
      };
    }
    
    console.log(`[Processor] Found ${duePosts.length} posts to process`);
    
    // Process posts in parallel (with concurrency limit)
    const concurrencyLimit = 3;
    const results = [];
    
    for (let i = 0; i < duePosts.length; i += concurrencyLimit) {
      const batch = duePosts.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map(post => processPost(post))
      );
      results.push(...batchResults);
    }
    
    // Summarize results
    const summary = {
      total: duePosts.length,
      successful: results.filter(r => r.status === 'fulfilled' && r.value.overallSuccess).length,
      failed: results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.overallSuccess)).length,
      errors: results
        .filter(r => r.status === 'rejected')
        .map(r => r.reason?.message || 'Unknown error')
    };
    
    console.log('[Processor] Batch complete:', summary);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Processing complete',
        ...summary
      })
    };
    
  } catch (error) {
    console.error('[Processor] Unexpected error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
