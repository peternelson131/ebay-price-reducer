/**
 * Get Dubbing Jobs - List user's recent dubbing jobs
 * 
 * GET /get-dubbing-jobs
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

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;

    // ─────────────────────────────────────────────────────────
    // Get user's dubbing jobs (last 20)
    // ─────────────────────────────────────────────────────────
    const { data: jobs, error: queryError } = await supabase
      .from('dubbing_jobs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (queryError) {
      console.error('Failed to query jobs:', queryError);
      return errorResponse(500, 'Failed to load jobs', headers);
    }

    return successResponse({
      success: true,
      jobs: jobs || []
    }, headers);

  } catch (error) {
    console.error('Error in get-dubbing-jobs:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
