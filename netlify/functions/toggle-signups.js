/**
 * Toggle Signups - Admin-only endpoint to enable/disable new account creation
 * 
 * GET /toggle-signups - Get current signup status
 * POST /toggle-signups - Toggle signup status
 * Body: { disabled: boolean }
 * 
 * Only accessible by admin users
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

  try {
    // Verify authentication
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(401, 'Unauthorized', headers);
    }

    const token = authHeader.replace('Bearer ', '');
    
    // Verify the user is authenticated and is admin
    const userSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data: { user }, error: authError } = await userSupabase.auth.getUser(token);

    if (authError || !user) {
      return errorResponse(401, 'Invalid authentication', headers);
    }

    // Check if user is admin
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_admin) {
      return errorResponse(403, 'Admin access required', headers);
    }

    // GET - Return current status
    if (event.httpMethod === 'GET') {
      const { data: setting, error } = await supabase
        .from('system_state')
        .select('value')
        .eq('key', 'signups_disabled')
        .single();

      if (error) {
        // If setting doesn't exist, signups are enabled by default
        return successResponse({
          signupsDisabled: false
        }, headers);
      }

      return successResponse({
        signupsDisabled: setting.value === 'true'
      }, headers);
    }

    // POST - Toggle the setting
    if (event.httpMethod === 'POST') {
      const { disabled } = JSON.parse(event.body || '{}');

      if (typeof disabled !== 'boolean') {
        return errorResponse(400, 'disabled must be a boolean', headers);
      }

      // Upsert the setting
      const { data, error } = await supabase
        .from('system_state')
        .upsert({
          key: 'signups_disabled',
          value: disabled ? 'true' : 'false',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        })
        .select()
        .single();

      if (error) {
        console.error('Failed to update signup status:', error);
        return errorResponse(500, 'Failed to update setting', headers);
      }

      console.log(`✅ Signups ${disabled ? 'disabled' : 'enabled'} by admin ${user.email}`);

      return successResponse({
        signupsDisabled: disabled,
        updated: true
      }, headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Toggle signups error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
