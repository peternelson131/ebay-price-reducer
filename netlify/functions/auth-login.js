/**
 * Auth Login - Simple email/password authentication
 * 
 * POST /auth-login
 * Body: { email, password }
 * Returns: { success, session: { access_token, refresh_token } }
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
    const { email, password } = JSON.parse(event.body || '{}');

    if (!email || !password) {
      return errorResponse(400, 'Email and password required', headers);
    }

    // Authenticate with Supabase
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      console.error('Auth error:', error.message);
      return errorResponse(401, error.message || 'Invalid credentials', headers);
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
      },
      user: {
        id: data.user.id,
        email: data.user.email
      }
    }, headers);

  } catch (error) {
    console.error('Login error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
