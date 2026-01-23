/**
 * Create Social Media Post
 * POST /.netlify/functions/social-posts-create
 * 
 * Body: {
 *   videoId: 'uuid',
 *   caption: 'text',
 *   platforms: ['instagram', 'youtube'],
 *   scheduledAt: '2026-01-24T10:00:00Z' (optional, null = draft, now = immediate),
 *   metadata: {} (optional)
 * }
 * 
 * Creates a new post record. If scheduledAt is NOW or in past, sets status to 'scheduled'
 * for immediate processing. If future, sets to 'scheduled'. If null, sets to 'draft'.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const VALID_PLATFORMS = ['instagram', 'youtube', 'facebook', 'tiktok', 'twitter', 'linkedin', 'pinterest', 'threads', 'bluesky'];

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
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { videoId, caption, platforms, scheduledAt, metadata } = body;
    
    // Validate required fields
    if (!videoId) {
      return errorResponse(400, 'videoId is required', headers);
    }
    
    if (!platforms || !Array.isArray(platforms) || platforms.length === 0) {
      return errorResponse(400, 'platforms array is required and must not be empty', headers);
    }
    
    // Validate platforms
    const invalidPlatforms = platforms.filter(p => !VALID_PLATFORMS.includes(p));
    if (invalidPlatforms.length > 0) {
      return errorResponse(400, `Invalid platforms: ${invalidPlatforms.join(', ')}. Valid: ${VALID_PLATFORMS.join(', ')}`, headers);
    }
    
    // Validate caption length (optional but limited)
    if (caption && caption.length > 2200) {
      return errorResponse(400, 'Caption too long (max 2200 characters)', headers);
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify video exists and belongs to user
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('id, user_id')
      .eq('id', videoId)
      .single();
    
    if (videoError || !video) {
      return errorResponse(404, 'Video not found', headers);
    }
    
    if (video.user_id !== userId) {
      return errorResponse(403, 'You do not have access to this video', headers);
    }
    
    // Check if user has connected accounts for requested platforms
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
      return errorResponse(400, `Not connected to: ${missingPlatforms.join(', ')}. Please connect these accounts first.`, headers);
    }
    
    // Determine status based on scheduledAt
    let status = 'draft';
    let scheduledAtValue = null;
    
    if (scheduledAt) {
      scheduledAtValue = new Date(scheduledAt).toISOString();
      const scheduledDate = new Date(scheduledAtValue);
      const now = new Date();
      
      // If scheduled time is in the past or within 1 minute, mark as scheduled for immediate processing
      if (scheduledDate <= new Date(now.getTime() + 60000)) {
        status = 'scheduled';
      } else {
        status = 'scheduled';
      }
    }
    
    // Create post
    const { data: post, error: insertError } = await supabase
      .from('social_posts')
      .insert({
        user_id: userId,
        video_id: videoId,
        caption: caption || null,
        scheduled_at: scheduledAtValue,
        platforms: platforms,
        status: status,
        metadata: metadata || null
      })
      .select()
      .single();
    
    if (insertError) {
      console.error('Error creating post:', insertError);
      return errorResponse(500, 'Failed to create post', headers);
    }
    
    return successResponse({
      post: {
        id: post.id,
        videoId: post.video_id,
        caption: post.caption,
        scheduledAt: post.scheduled_at,
        platforms: post.platforms,
        status: post.status,
        metadata: post.metadata,
        createdAt: post.created_at,
        updatedAt: post.updated_at
      },
      message: status === 'scheduled' ? 'Post created and scheduled for processing' : 'Post saved as draft'
    }, headers, 201);
    
  } catch (error) {
    console.error('Unexpected error in social-posts-create:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
