/**
 * Publish Post Immediately
 * POST /.netlify/functions/social-posts-publish-now?id=xxx
 * 
 * Triggers immediate publishing of a draft or scheduled post.
 * Directly processes the post using platform workers for instant publishing.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth, decryptToken } = require('./utils/auth');
const InstagramWorker = require('./utils/social-worker-instagram');
const YouTubeWorker = require('./utils/social-worker-youtube');

// Platform workers
const WORKERS = {
  instagram: new InstagramWorker(),
  youtube: new YouTubeWorker()
};

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const PUBLISHABLE_STATUSES = ['draft', 'scheduled', 'failed'];

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }
  
  const userId = authResult.userId;
  
  try {
    // Get post ID from query params
    const { id } = event.queryStringParameters || {};
    
    if (!id) {
      return errorResponse(400, 'Post ID required', headers);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return errorResponse(400, 'Invalid post ID format', headers);
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch post to verify ownership and check status
    const { data: post, error: fetchError } = await supabase
      .from('social_posts')
      .select('id, status, video_id, platforms, caption, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (fetchError || !post) {
      console.error('Post not found:', fetchError);
      return errorResponse(404, 'Post not found', headers);
    }
    
    // Check if post can be published
    if (!PUBLISHABLE_STATUSES.includes(post.status)) {
      return errorResponse(400, `Cannot publish post with status '${post.status}'. Only draft, scheduled, and failed posts can be published.`, headers);
    }
    
    // Check if processing (already being posted)
    if (post.status === 'processing') {
      return errorResponse(400, 'Post is already being processed', headers);
    }
    
    // Check if already posted
    if (post.status === 'posted') {
      return errorResponse(400, 'Post has already been published', headers);
    }
    
    // Verify user has connected accounts for all platforms
    const { data: accounts, error: accountsError } = await supabase
      .from('social_accounts')
      .select('platform')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('platform', post.platforms);
    
    if (accountsError) {
      console.error('Error checking accounts:', accountsError);
      return errorResponse(500, 'Failed to verify social accounts', headers);
    }
    
    const connectedPlatforms = accounts.map(a => a.platform);
    const missingPlatforms = post.platforms.filter(p => !connectedPlatforms.includes(p));
    
    if (missingPlatforms.length > 0) {
      return errorResponse(400, `Cannot publish: not connected to ${missingPlatforms.join(', ')}. Please reconnect these accounts.`, headers);
    }
    
    // Verify video exists and is ready for social posting
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('id, social_ready_url, duration_seconds, file_size')
      .eq('id', post.video_id)
      .single();
    
    if (videoError || !video) {
      return errorResponse(404, 'Video not found for this post', headers);
    }
    
    if (!video.social_ready_url) {
      return errorResponse(400, 'Video is not yet ready for social posting. Please wait for processing to complete.', headers);
    }
    
    // Mark as processing
    const now = new Date().toISOString();
    await supabase
      .from('social_posts')
      .update({
        scheduled_at: now,
        status: 'processing',
        processed_at: now,
        updated_at: now
      })
      .eq('id', id);
    
    // Get social accounts with tokens for posting
    const { data: socialAccounts, error: saError } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('platform', post.platforms);
    
    if (saError) {
      console.error('Error fetching social accounts:', saError);
      return errorResponse(500, 'Failed to fetch social accounts', headers);
    }
    
    // Process each platform
    const results = {
      platforms: {},
      overallSuccess: true
    };
    
    for (const platform of post.platforms) {
      const worker = WORKERS[platform];
      const account = socialAccounts.find(a => a.platform === platform);
      
      if (!worker) {
        console.error(`No worker for platform: ${platform}`);
        results.platforms[platform] = { success: false, error: 'Platform not supported' };
        results.overallSuccess = false;
        continue;
      }
      
      if (!account) {
        console.error(`No account for platform: ${platform}`);
        results.platforms[platform] = { success: false, error: 'Account not found' };
        results.overallSuccess = false;
        continue;
      }
      
      try {
        // Decrypt access token for the worker
        const decryptedAccount = {
          ...account,
          access_token: decryptToken(account.access_token)
        };
        
        console.log(`[PublishNow] Posting to ${platform}...`);
        const postResult = await worker.postToPlatform(
          decryptedAccount,
          { caption: post.caption, id: post.id },
          {
            id: video.id,
            url: video.social_ready_url,
            duration: video.duration_seconds
          }
        );
        
        console.log(`[PublishNow] ${platform} result:`, postResult);
        
        results.platforms[platform] = {
          success: true,
          platformPostId: postResult.postId,
          platformUrl: postResult.url
        };
        
        // Store success result
        await supabase
          .from('post_results')
          .insert({
            post_id: post.id,
            social_account_id: account.id,
            platform: platform,
            success: true,
            platform_post_id: postResult.postId,
            platform_url: postResult.url,
            posted_at: new Date().toISOString()
          });
          
      } catch (error) {
        console.error(`[PublishNow] ${platform} error:`, error);
        
        results.platforms[platform] = {
          success: false,
          error: error.message
        };
        results.overallSuccess = false;
        
        // Store error result
        await supabase
          .from('post_results')
          .insert({
            post_id: post.id,
            social_account_id: account.id,
            platform: platform,
            success: false,
            error_message: error.message,
            posted_at: new Date().toISOString()
          });
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
      .eq('id', id);
    
    // Success response
    return successResponse({
      post: {
        id: post.id,
        videoId: post.video_id,
        caption: post.caption,
        platforms: post.platforms,
        status: finalStatus
      },
      results: results.platforms,
      overallSuccess: results.overallSuccess,
      message: results.overallSuccess ? 'Successfully posted to all platforms!' : 'Some platforms failed - check results'
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-publish-now:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
