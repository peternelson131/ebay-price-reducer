/**
 * Publish Post Immediately
 * POST /.netlify/functions/social-posts-publish-now?id=xxx
 * 
 * Triggers immediate publishing of a draft or scheduled post.
 * Sets scheduled_at to NOW() and status to 'scheduled' for immediate processing.
 * 
 * The scheduled processor will pick it up within 1 minute.
 * For truly instant publishing, this could also trigger the processor directly,
 * but async via scheduler is more reliable for large videos.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

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
    
    // Update post to schedule for immediate processing
    const now = new Date().toISOString();
    const { data: updatedPost, error: updateError } = await supabase
      .from('social_posts')
      .update({
        scheduled_at: now,
        status: 'scheduled',
        updated_at: now
      })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating post:', updateError);
      return errorResponse(500, 'Failed to schedule post for publishing', headers);
    }
    
    // Success response
    return successResponse({
      post: {
        id: updatedPost.id,
        videoId: updatedPost.video_id,
        caption: updatedPost.caption,
        scheduledAt: updatedPost.scheduled_at,
        platforms: updatedPost.platforms,
        status: updatedPost.status,
        updatedAt: updatedPost.updated_at
      },
      message: 'Post scheduled for immediate publishing',
      estimatedProcessingTime: 'Within 1 minute',
      note: 'The scheduled processor will pick up this post shortly. You can check the status by refreshing the post details.'
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-publish-now:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
