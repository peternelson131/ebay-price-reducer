/**
 * Save API Key (with server-side encryption)
 * 
 * Securely saves API keys by encrypting them on the server side.
 * The frontend should call this instead of writing directly to the database.
 * 
 * SECURITY: Requires valid JWT Bearer token
 * 
 * POST /save-api-key
 * Body: { "service": "keepa", "apiKey": "your-api-key" }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { encrypt, isEncryptionConfigured } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Allowed services
const ALLOWED_SERVICES = ['keepa', 'ebay', 'elevenlabs'];

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
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
    console.log(`✅ Authenticated user: ${userId}`);

    // ─────────────────────────────────────────────────────────
    // Validate input
    // ─────────────────────────────────────────────────────────
    const body = JSON.parse(event.body || '{}');
    const { service, apiKey, label } = body;

    if (!service || !apiKey) {
      return errorResponse(400, 'Missing required fields: service, apiKey', headers);
    }

    if (!ALLOWED_SERVICES.includes(service)) {
      return errorResponse(400, `Invalid service. Allowed: ${ALLOWED_SERVICES.join(', ')}`, headers);
    }

    if (apiKey.length < 10 || apiKey.length > 500) {
      return errorResponse(400, 'Invalid API key length', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Verify encryption is configured
    // ─────────────────────────────────────────────────────────
    if (!isEncryptionConfigured()) {
      console.error('ENCRYPTION_KEY not configured');
      return errorResponse(500, 'Server configuration error', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Encrypt the API key
    // ─────────────────────────────────────────────────────────
    const encryptedKey = encrypt(apiKey.trim());
    
    if (!encryptedKey) {
      console.error('Failed to encrypt API key');
      return errorResponse(500, 'Failed to secure API key', headers);
    }

    console.log(`🔐 Encrypted ${service} key for user ${userId}`);

    // ─────────────────────────────────────────────────────────
    // Check if key already exists for this user/service
    // ─────────────────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('user_api_keys')
      .select('id')
      .eq('user_id', userId)
      .eq('service', service)
      .single();

    if (existing) {
      // Update existing key
      const { error } = await supabase
        .from('user_api_keys')
        .update({
          api_key_encrypted: encryptedKey,
          is_valid: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (error) {
        console.error('Failed to update key:', error);
        return errorResponse(500, 'Failed to save API key', headers);
      }

      return successResponse({ 
        success: true, 
        message: `${service} API key updated successfully`,
        action: 'updated'
      }, headers);

    } else {
      // Insert new key
      const { error } = await supabase
        .from('user_api_keys')
        .insert({
          user_id: userId,
          service: service,
          api_key_encrypted: encryptedKey,
          label: label || 'default',
          is_valid: true
        });

      if (error) {
        console.error('Failed to insert key:', error);
        return errorResponse(500, 'Failed to save API key', headers);
      }

      return successResponse({ 
        success: true, 
        message: `${service} API key saved successfully`,
        action: 'created'
      }, headers);
    }

  } catch (error) {
    console.error('Error saving API key:', error);
    return errorResponse(500, 'Failed to save API key', headers);
  }
};
