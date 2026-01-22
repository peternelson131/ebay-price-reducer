/**
 * Instagram Status - Get connection status and manage schedule
 * GET /instagram-status - Returns connection status and schedule
 * PUT /instagram-status - Update posting schedule
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
        .select('account_id, account_name, account_avatar, connected_at, is_active, token_expires_at, access_token')
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .single();

      // Verify token is still valid if connection exists
      let tokenValid = false;
      if (connection && connection.access_token) {
        try {
          // Make a simple API call to verify token
          const verifyUrl = new URL(`https://graph.instagram.com/${connection.account_id}`);
          verifyUrl.searchParams.set('fields', 'id,username');
          verifyUrl.searchParams.set('access_token', connection.access_token);
          
          const verifyResponse = await fetch(verifyUrl.toString());
          const verifyData = await verifyResponse.json();
          
          tokenValid = !verifyData.error;
        } catch (e) {
          console.warn('Token verification failed:', e);
          tokenValid = false;
        }
      }

      // Get schedule
      const { data: schedule } = await supabase
        .from('posting_schedules')
        .select('post_time, timezone, is_active')
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .single();

      // Get recent posts
      const { data: recentPosts } = await supabase
        .from('scheduled_posts')
        .select('id, title, status, scheduled_for, posted_at, platform_url, error_message')
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .order('scheduled_for', { ascending: false })
        .limit(10);

      return successResponse({
        connected: !!connection,
        tokenValid,
        connection: connection ? {
          accountId: connection.account_id,
          username: connection.account_name,
          avatar: connection.account_avatar,
          connectedAt: connection.connected_at,
          tokenExpiresAt: connection.token_expires_at
        } : null,
        schedule: schedule || { post_time: '10:00', timezone: 'America/Chicago', is_active: false },
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
          platform: 'instagram',
          post_time: post_time || '10:00',
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

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Instagram status error:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
