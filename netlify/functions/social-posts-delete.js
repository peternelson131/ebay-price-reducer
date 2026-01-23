/**
 * Delete Social Media Post
 * DELETE /.netlify/functions/social-posts-delete?id=xxx
 * 
 * Deletes a post and its results.
 * Only draft, scheduled, and failed posts can be deleted.
 * Posted posts cannot be deleted (they're historical records).
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DELETABLE_STATUSES = ['draft', 'scheduled', 'failed', 'cancelled'];

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow DELETE
  if (event.httpMethod !== 'DELETE') {
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
      .select('id, status, video_id, platforms')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (fetchError || !post) {
      console.error('Post not found:', fetchError);
      return errorResponse(404, 'Post not found', headers);
    }
    
    // Check if post can be deleted
    if (!DELETABLE_STATUSES.includes(post.status)) {
      return errorResponse(400, `Cannot delete post with status '${post.status}'. Only draft, scheduled, failed, and cancelled posts can be deleted.`, headers);
    }
    
    // Delete post (CASCADE will delete results)
    const { error: deleteError } = await supabase
      .from('social_posts')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    
    if (deleteError) {
      console.error('Error deleting post:', deleteError);
      return errorResponse(500, 'Failed to delete post', headers);
    }
    
    return successResponse({
      success: true,
      message: 'Post deleted successfully',
      deletedPostId: id
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-delete:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
