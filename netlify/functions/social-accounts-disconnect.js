/**
 * Disconnect Social Media Account
 * DELETE /.netlify/functions/social-accounts-disconnect?id=xxx
 * 
 * Marks a social account as inactive (soft delete).
 * Tokens are preserved in case user wants to reconnect.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;
  
  const headers = getCorsHeaders(event);
  
  // Only allow DELETE
  if (event.httpMethod !== 'DELETE') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }
  
  const userId = authResult.userId;
  
  try {
    // Get account ID from query params OR body
    let id = event.queryStringParameters?.id;
    
    // Also check body if not in query params
    if (!id && event.body) {
      try {
        const body = JSON.parse(event.body);
        id = body.accountId || body.id;
      } catch (e) {
        // Body parse failed, continue
      }
    }
    
    if (!id) {
      return errorResponse(400, 'Account ID required', headers);
    }
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(id)) {
      return errorResponse(400, 'Invalid account ID format', headers);
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if account exists and belongs to user
    const { data: account, error: fetchError } = await supabase
      .from('social_accounts')
      .select('id, platform, username')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    
    if (fetchError || !account) {
      console.error('Account not found:', fetchError);
      return errorResponse(404, 'Account not found', headers);
    }
    
    // Soft delete: mark as inactive
    const { error: updateError } = await supabase
      .from('social_accounts')
      .update({ 
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Error disconnecting account:', updateError);
      return errorResponse(500, 'Failed to disconnect account', headers);
    }
    
    return successResponse({
      success: true,
      message: `${account.platform} account disconnected`,
      accountId: id,
      platform: account.platform,
      username: account.username
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-accounts-disconnect:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
