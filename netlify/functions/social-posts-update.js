/**
 * Update Social Media Post
 * PATCH /.netlify/functions/social-posts-update?id=xxx
 * 
 * Body: {
 *   caption?: 'text',
 *   platforms?: ['instagram', 'youtube'],
 *   scheduledAt?: '2026-01-24T10:00:00Z',
 *   status?: 'draft' | 'scheduled',
 *   metadata?: {}
 * }
 * 
 * Only draft and scheduled posts can be updated.
 * Processing, posted, and failed posts are read-only.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_PLATFORMS = ['instagram', 'youtube', 'facebook', 'tiktok', 'twitter', 'linkedin', 'pinterest', 'threads', 'bluesky'];
const EDITABLE_STATUSES = ['draft', 'scheduled'];

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow PATCH
  if (event.httpMethod !== 'PATCH') {
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
    
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { caption, platforms, scheduledAt, status, metadata } = body;
    
    // Validate platforms if provided
    if (platforms) {
      if (!Array.isArray(platforms) || platforms.length === 0) {
        return errorResponse(400, 'platforms must be a non-empty array', headers);
      }
      
      const invalidPlatforms = platforms.filter(p => !VALID_PLATFORMS.includes(p));
      if (invalidPlatforms.length > 0) {
        return errorResponse(400, `Invalid platforms: ${invalidPlatforms.join(', ')}`, headers);
      }
    }
    
    // Validate caption length
    if (caption && caption.length > 2200) {
      return errorResponse(400, 'Caption too long (max 2200 characters)', headers);
    }
    
    // Validate status if provided
    if (status && !EDITABLE_STATUSES.includes(status)) {
      return errorResponse(400, `Status can only be set to: ${EDITABLE_STATUSES.join(', ')}`, headers);
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Fetch existing post
    const { data: existingPost, error: fetchError } = await supabase
      .from('social_posts')
      .select('id, status, platforms, user_id')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (fetchError || !existingPost) {
      console.error('Post not found:', fetchError);
      return errorResponse(404, 'Post not found', headers);
    }
    
    // Check if post is editable
    if (!EDITABLE_STATUSES.includes(existingPost.status)) {
      return errorResponse(400, `Cannot edit post with status '${existingPost.status}'. Only draft and scheduled posts can be edited.`, headers);
    }
    
    // If platforms are being changed, verify connections
    if (platforms) {
      const { data: accounts, error: accountsError } = await supabase
        .from('social_accounts')
        .select('platform')
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('platform', platforms);
      
      if (accountsError) {
        console.error('Error checking accounts:', accountsError);
        return errorResponse(500, 'Failed to verify social accounts', headers);
      }
      
      const connectedPlatforms = accounts.map(a => a.platform);
      const missingPlatforms = platforms.filter(p => !connectedPlatforms.includes(p));
      
      if (missingPlatforms.length > 0) {
        return errorResponse(400, `Not connected to: ${missingPlatforms.join(', ')}`, headers);
      }
    }
    
    // Build update object
    const updates = {
      updated_at: new Date().toISOString()
    };
    
    if (caption !== undefined) updates.caption = caption;
    if (platforms !== undefined) updates.platforms = platforms;
    if (metadata !== undefined) updates.metadata = metadata;
    if (status !== undefined) updates.status = status;
    
    if (scheduledAt !== undefined) {
      if (scheduledAt === null) {
        updates.scheduled_at = null;
        updates.status = 'draft';
      } else {
        updates.scheduled_at = new Date(scheduledAt).toISOString();
        // Auto-update status if scheduling
        const scheduledDate = new Date(updates.scheduled_at);
        const now = new Date();
        if (scheduledDate <= new Date(now.getTime() + 60000)) {
          updates.status = 'scheduled'; // Immediate or very soon
        } else {
          updates.status = 'scheduled'; // Future
        }
      }
    }
    
    // Update post
    const { data: updatedPost, error: updateError } = await supabase
      .from('social_posts')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    
    if (updateError) {
      console.error('Error updating post:', updateError);
      return errorResponse(500, 'Failed to update post', headers);
    }
    
    return successResponse({
      post: {
        id: updatedPost.id,
        videoId: updatedPost.video_id,
        caption: updatedPost.caption,
        scheduledAt: updatedPost.scheduled_at,
        platforms: updatedPost.platforms,
        status: updatedPost.status,
        metadata: updatedPost.metadata,
        createdAt: updatedPost.created_at,
        updatedAt: updatedPost.updated_at
      },
      message: 'Post updated successfully'
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-update:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
