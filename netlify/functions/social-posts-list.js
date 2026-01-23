/**
 * List Social Media Posts
 * GET /.netlify/functions/social-posts-list?status=scheduled&limit=50
 * 
 * Returns posts for the authenticated user with optional filtering.
 * Query params:
 * - status: filter by status (draft, scheduled, processing, posted, failed)
 * - limit: max results (default 50, max 100)
 * - offset: pagination offset
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_STATUSES = ['draft', 'scheduled', 'processing', 'posted', 'failed', 'cancelled'];

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
    // Parse query parameters
    const params = event.queryStringParameters || {};
    const status = params.status;
    const limit = Math.min(parseInt(params.limit) || 50, 100);
    const offset = parseInt(params.offset) || 0;
    
    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return errorResponse(400, `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, headers);
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Build query
    let query = supabase
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
        product_videos(id, filename, social_ready_url, thumbnail_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    // Apply status filter
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: posts, error: postsError } = await query;
    
    if (postsError) {
      console.error('Error fetching posts:', postsError);
      return errorResponse(500, 'Failed to fetch posts', headers);
    }
    
    // Get post IDs for results lookup
    const postIds = posts.map(p => p.id);
    
    // Fetch results for these posts
    const { data: results, error: resultsError } = await supabase
      .from('post_results')
      .select('*')
      .in('post_id', postIds);
    
    if (resultsError) {
      console.error('Error fetching results:', resultsError);
      // Continue without results rather than failing
    }
    
    // Group results by post_id
    const resultsByPost = {};
    (results || []).forEach(result => {
      if (!resultsByPost[result.post_id]) {
        resultsByPost[result.post_id] = [];
      }
      resultsByPost[result.post_id].push({
        id: result.id,
        platform: result.platform,
        success: result.success,
        errorMessage: result.error_message,
        errorCode: result.error_code,
        platformPostId: result.platform_post_id,
        platformPostUrl: result.platform_post_url,
        postedAt: result.posted_at,
        metadata: result.metadata
      });
    });
    
    // Transform posts for response
    const postsList = posts.map(post => ({
      id: post.id,
      videoId: post.video_id,
      video: post.product_videos ? {
        id: post.product_videos.id,
        title: post.product_videos.filename,
        url: post.product_videos.social_ready_url,
        thumbnailUrl: post.product_videos.thumbnail_url
      } : null,
      caption: post.caption,
      scheduledAt: post.scheduled_at,
      platforms: post.platforms,
      status: post.status,
      metadata: post.metadata,
      results: resultsByPost[post.id] || [],
      createdAt: post.created_at,
      updatedAt: post.updated_at,
      processedAt: post.processed_at
    }));
    
    // Get total count for pagination
    let countQuery = supabase
      .from('social_posts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    
    if (status) {
      countQuery = countQuery.eq('status', status);
    }
    
    const { count, error: countError } = await countQuery;
    
    return successResponse({
      posts: postsList,
      pagination: {
        offset,
        limit,
        total: count || posts.length
      }
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-list:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
