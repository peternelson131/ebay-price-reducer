/**
 * Get Single Social Media Post
 * GET /.netlify/functions/social-posts-get?id=xxx
 * 
 * Returns a single post with its results and video details.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow GET
  if (event.httpMethod !== 'GET') {
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
    
    // Fetch post with video details
    const { data: post, error: postError } = await supabase
      .from('social_posts')
      .select(`
        id,
        video_id,
        caption,
        scheduled_at,
        platforms,
        status,
        metadata,
        created_at,
        updated_at,
        processed_at,
        product_videos(id, title, url, thumbnail_url, duration, mime_type)
      `)
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (postError || !post) {
      console.error('Post not found:', postError);
      return errorResponse(404, 'Post not found', headers);
    }
    
    // Fetch results for this post
    const { data: results, error: resultsError } = await supabase
      .from('post_results')
      .select(`
        id,
        social_account_id,
        platform,
        success,
        error_message,
        error_code,
        platform_post_id,
        platform_post_url,
        posted_at,
        metadata,
        social_accounts(platform, username, account_id)
      `)
      .eq('post_id', id)
      .order('posted_at', { ascending: false });
    
    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      // Continue without results
    }
    
    // Transform response
    const response = {
      id: post.id,
      videoId: post.video_id,
      video: post.product_videos ? {
        id: post.product_videos.id,
        title: post.product_videos.title,
        url: post.product_videos.url,
        thumbnailUrl: post.product_videos.thumbnail_url,
        duration: post.product_videos.duration,
        mimeType: post.product_videos.mime_type
      } : null,
      caption: post.caption,
      scheduledAt: post.scheduled_at,
      platforms: post.platforms,
      status: post.status,
      metadata: post.metadata,
      results: (results || []).map(r => ({
        id: r.id,
        accountId: r.social_account_id,
        account: r.social_accounts ? {
          platform: r.social_accounts.platform,
          username: r.social_accounts.username,
          accountId: r.social_accounts.account_id
        } : null,
        platform: r.platform,
        success: r.success,
        errorMessage: r.error_message,
        errorCode: r.error_code,
        platformPostId: r.platform_post_id,
        platformPostUrl: r.platform_post_url,
        postedAt: r.posted_at,
        metadata: r.metadata
      })),
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      processedAt: post.processed_at
    };
    
    return successResponse(response, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-get:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
