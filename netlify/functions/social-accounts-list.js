/**
 * List Social Media Accounts
 * GET /.netlify/functions/social-accounts-list
 * 
 * Returns all connected social media accounts for the authenticated user.
 * Tokens are NOT returned (security), only connection status and metadata.
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
  
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }
  
  const userId = authResult.userId;
  
  try {
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        headers: {
          Authorization: event.headers.authorization || event.headers.Authorization
        }
      }
    });
    
    // Query social accounts (RLS will filter to user's accounts)
    const { data: accounts, error } = await supabase
      .from('social_accounts')
      .select('id, platform, username, account_id, account_metadata, is_active, token_expires_at, connected_at, updated_at')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('connected_at', { ascending: false });
    
    if (error) {
      console.error('Error fetching social accounts:', error);
      return errorResponse(500, 'Failed to fetch social accounts', headers);
    }
    
    // Transform accounts for response
    const accountsList = accounts.map(account => ({
      id: account.id,
      platform: account.platform,
      username: account.username,
      accountId: account.account_id,
      metadata: account.account_metadata,
      isActive: account.is_active,
      tokenExpiresAt: account.token_expires_at,
      connectedAt: account.connected_at,
      updatedAt: account.updated_at,
      // Token status
      isExpired: account.token_expires_at ? new Date(account.token_expires_at) < new Date() : false,
      needsReconnect: account.token_expires_at ? new Date(account.token_expires_at) < new Date() : false
    }));
    
    return successResponse({
      accounts: accountsList,
      count: accountsList.length
    }, headers);
    
  } catch (error) {
    console.error('Unexpected error in social-accounts-list:', error);
    return errorResponse(500, 'Internal server error', headers);
  }
};
