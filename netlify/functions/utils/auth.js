/**
 * Shared authentication utility for Netlify Functions
 * Provides JWT verification and webhook secret validation
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client for auth verification
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Verify JWT Bearer token from Authorization header
 * @param {Object} event - Netlify function event
 * @returns {Object} - { success: boolean, userId?: string, user?: object, error?: string, statusCode?: number }
 */
async function verifyAuth(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  
  if (!authHeader) {
    return {
      success: false,
      statusCode: 401,
      error: 'Authorization header required'
    };
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    return {
      success: false,
      statusCode: 401,
      error: 'Invalid authorization format. Use: Bearer <token>'
    };
  }
  
  const token = authHeader.substring(7);
  
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.log('Auth verification failed:', authError?.message || 'No user');
      return {
        success: false,
        statusCode: 401,
        error: 'Invalid or expired token'
      };
    }
    
    return {
      success: true,
      userId: user.id,
      user: user
    };
  } catch (error) {
    console.error('Auth verification error:', error);
    return {
      success: false,
      statusCode: 500,
      error: 'Authentication service error'
    };
  }
}

/**
 * Verify webhook secret for scheduled/background jobs
 * @param {Object} event - Netlify function event
 * @returns {Object} - { success: boolean, error?: string, statusCode?: number }
 */
function verifyWebhookSecret(event) {
  const webhookSecret = process.env.WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    console.error('WEBHOOK_SECRET not configured');
    return {
      success: false,
      statusCode: 500,
      error: 'Server configuration error'
    };
  }
  
  // Check header
  const providedSecret = event.headers['x-webhook-secret'] || 
                         event.headers['X-Webhook-Secret'];
  
  // Also check query param for Netlify scheduled functions
  const querySecret = event.queryStringParameters?.secret;
  
  if (providedSecret === webhookSecret || querySecret === webhookSecret) {
    return { success: true };
  }
  
  return {
    success: false,
    statusCode: 401,
    error: 'Invalid webhook secret'
  };
}

/**
 * Verify either JWT token OR webhook secret (for endpoints that support both)
 * @param {Object} event - Netlify function event
 * @returns {Object} - { success: boolean, userId?: string, isWebhook?: boolean, error?: string }
 */
async function verifyAuthOrWebhook(event) {
  // Try webhook secret first (faster, no async)
  const webhookResult = verifyWebhookSecret(event);
  if (webhookResult.success) {
    return { success: true, isWebhook: true };
  }
  
  // Try JWT auth
  const authResult = await verifyAuth(event);
  if (authResult.success) {
    return { success: true, userId: authResult.userId, user: authResult.user, isWebhook: false };
  }
  
  // Both failed
  return {
    success: false,
    statusCode: 401,
    error: 'Authentication required. Provide Bearer token or webhook secret.'
  };
}

/**
 * Create an unauthorized response
 * @param {Object} headers - CORS headers to include
 * @param {string} message - Error message
 * @returns {Object} - Netlify function response
 */
function unauthorizedResponse(headers, message = 'Unauthorized') {
  return {
    statusCode: 401,
    headers,
    body: JSON.stringify({ error: message })
  };
}

/**
 * Create a forbidden response
 * @param {Object} headers - CORS headers to include
 * @param {string} message - Error message
 * @returns {Object} - Netlify function response
 */
function forbiddenResponse(headers, message = 'Forbidden') {
  return {
    statusCode: 403,
    headers,
    body: JSON.stringify({ error: message })
  };
}

module.exports = {
  verifyAuth,
  verifyWebhookSecret,
  verifyAuthOrWebhook,
  unauthorizedResponse,
  forbiddenResponse
};
