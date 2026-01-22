/**
 * Instagram Disconnect - Remove Instagram connection
 * DELETE /instagram-disconnect - Removes the Instagram connection from database
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

    // Delete the connection
    const { error } = await supabase
      .from('social_connections')
      .delete()
      .eq('user_id', userId)
      .eq('platform', 'instagram');

    if (error) {
      console.error('Failed to disconnect Instagram:', error);
      return errorResponse(500, 'Failed to disconnect Instagram', headers);
    }

    return successResponse({ 
      success: true, 
      message: 'Instagram disconnected successfully' 
    }, headers);

  } catch (error) {
    console.error('Instagram disconnect error:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
