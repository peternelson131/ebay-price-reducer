/**
 * YouTube Status - Get connection status and manage schedule
 * GET /youtube-status - Returns connection status and schedule
 * PUT /youtube-status - Update posting schedule
 * DELETE /youtube-status - Disconnect YouTube
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;

    // GET - Return connection status
    if (event.httpMethod === 'GET') {
      // Get connection
      const { data: connection } = await supabase
        .from('social_connections')
        .select('account_id, account_name, account_avatar, connected_at, is_active, token_expires_at')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .single();

      // Get schedule
      const { data: schedule } = await supabase
        .from('posting_schedules')
        .select('post_time, timezone, is_active')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .single();

      // Get recent posts
      const { data: recentPosts } = await supabase
        .from('scheduled_posts')
        .select('id, title, status, scheduled_for, posted_at, platform_url, error_message')
        .eq('user_id', userId)
        .eq('platform', 'youtube')
        .order('scheduled_for', { ascending: false })
        .limit(10);

      return successResponse({
        connected: !!connection,
        connection: connection ? {
          channelId: connection.account_id,
          channelName: connection.account_name,
          channelAvatar: connection.account_avatar,
          connectedAt: connection.connected_at,
          tokenExpiresAt: connection.token_expires_at
        } : null,
        schedule: schedule || { post_time: '09:00', timezone: 'America/Chicago', is_active: false },
        recentPosts: recentPosts || []
      }, headers);
    }

    // PUT - Update schedule
    if (event.httpMethod === 'PUT') {
      const { post_time, timezone, is_active } = JSON.parse(event.body || '{}');

      const { error } = await supabase
        .from('posting_schedules')
        .upsert({
          user_id: userId,
          platform: 'youtube',
          post_time: post_time || '09:00',
          timezone: timezone || 'America/Chicago',
          is_active: is_active ?? false,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,platform'
        });

      if (error) {
        console.error('Failed to update schedule:', error);
        return errorResponse(500, 'Failed to update schedule', headers);
      }

      return successResponse({ success: true, message: 'Schedule updated' }, headers);
    }

    // DELETE - Disconnect
    if (event.httpMethod === 'DELETE') {
      // Delete connection
      await supabase
        .from('social_connections')
        .delete()
        .eq('user_id', userId)
        .eq('platform', 'youtube');

      // Delete schedule
      await supabase
        .from('posting_schedules')
        .delete()
        .eq('user_id', userId)
        .eq('platform', 'youtube');

      return successResponse({ success: true, message: 'YouTube disconnected' }, headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('YouTube status error:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
