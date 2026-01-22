/**
 * Meta Disconnect - Remove Meta (Facebook/Instagram) connection
 * DELETE /meta-disconnect - Disconnects Meta account
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

    // Only allow DELETE method
    if (event.httpMethod !== 'DELETE') {
      return errorResponse(405, 'Method not allowed', headers);
    }

    // Delete connection
    const { error: connectionError } = await supabase
      .from('social_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'meta');

    if (connectionError) {
      console.error('Failed to delete connection:', connectionError);
      return errorResponse(500, 'Failed to disconnect Meta account', headers);
    }

    // Delete schedule
    await supabase
      .from('posting_schedules')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'meta');

    // Note: We don't delete scheduled_posts to preserve history
    // Just mark them as cancelled if they're still pending
    await supabase
      .from('scheduled_posts')
      .update({ 
        status: 'cancelled',
        error_message: 'User disconnected Meta account',
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .eq('platform', 'meta')
      .eq('status', 'pending');

    return successResponse({ 
      success: true, 
      message: 'Meta account disconnected successfully' 
    }, headers);

  } catch (error) {
    console.error('Meta disconnect error:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
