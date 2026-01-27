/**
 * Auth Refresh - Refresh access token using refresh token
 * 
 * POST /auth-refresh
 * Body: { refresh_token }
 * Returns: { success, session: { access_token, refresh_token, expires_at } }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    const { refresh_token } = JSON.parse(event.body || '{}');

    if (!refresh_token) {
      return errorResponse(400, 'Refresh token required', headers);
    }

    // Use Supabase to refresh the session
    const { data, error } = await supabase.auth.refreshSession({
      refresh_token
    });

    if (error) {
      console.error('Refresh error:', error.message);
      return errorResponse(401, error.message || 'Token refresh failed', headers);
    }

    if (!data.session) {
      return errorResponse(401, 'No session returned', headers);
    }

    return successResponse({
      success: true,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at
      }
    }, headers);

  } catch (error) {
    console.error('Auth refresh error:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
