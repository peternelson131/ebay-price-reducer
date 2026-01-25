/**
 * Check Signup Status - Public endpoint to check if new signups are allowed
 * 
 * GET /check-signup-status - Returns whether signups are currently disabled
 * 
 * This is a public endpoint (no auth required) so the signup page can check
 * whether to show the signup form or a "Coming Soon" message
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for system_state access
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Check the system_state table for signups_disabled setting
    const { data: setting, error } = await supabase
      .from('system_state')
      .select('value')
      .eq('key', 'signups_disabled')
      .single();

    if (error) {
      // If setting doesn't exist, signups are enabled by default
      return successResponse({
        signupsDisabled: false,
        message: 'Signups are enabled'
      }, headers);
    }

    const signupsDisabled = setting.value === 'true';

    return successResponse({
      signupsDisabled,
      message: signupsDisabled ? 'Signups are currently disabled' : 'Signups are enabled'
    }, headers);

  } catch (error) {
    console.error('Check signup status error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
