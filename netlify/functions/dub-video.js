/**
 * Dub Video - Start Eleven Labs dubbing job
 * 
 * POST /dub-video
 * Content-Type: multipart/form-data
 * - video: File
 * - targetLanguage: string (es, fr, de, it, pt, etc.)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { decrypt } = require('./utils/encryption');
const busboy = require('busboy');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Supported target languages
const SUPPORTED_LANGUAGES = {
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'it': 'Italian',
  'pt': 'Portuguese',
  'pl': 'Polish',
  'hi': 'Hindi',
  'ja': 'Japanese',
  'ko': 'Korean',
  'zh': 'Chinese'
};

// Parse multipart form data
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const bb = busboy({ 
      headers: { 'content-type': event.headers['content-type'] || event.headers['Content-Type'] }
    });
    
    const fields = {};
    let fileBuffer = null;
    let fileName = null;
    let fileMimeType = null;

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      fileName = filename;
      fileMimeType = mimeType;
      const chunks = [];
      
      file.on('data', (data) => chunks.push(data));
      file.on('end', () => {
        fileBuffer = Buffer.concat(chunks);
      });
    });

    bb.on('field', (name, value) => {
      fields[name] = value;
    });

    bb.on('finish', () => {
      resolve({ fields, fileBuffer, fileName, fileMimeType });
    });

    bb.on('error', reject);

    // Handle base64 encoded body from API Gateway
    const body = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64') 
      : Buffer.from(event.body);
    
    bb.end(body);
  });
}

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
    // Get user's Eleven Labs API key
    // ─────────────────────────────────────────────────────────
    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('service', 'elevenlabs')
      .single();

    if (keyError || !apiKeyRecord) {
      return errorResponse(400, 'Eleven Labs API key not configured. Please add it in API Keys settings.', headers);
    }

    const elevenLabsKey = decrypt(apiKeyRecord.encrypted_key);
    if (!elevenLabsKey) {
      return errorResponse(500, 'Failed to decrypt API key', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Parse multipart form data
    // ─────────────────────────────────────────────────────────
    const { fields, fileBuffer, fileName, fileMimeType } = await parseMultipart(event);
    
    const targetLanguage = fields.targetLanguage;
    
    if (!fileBuffer) {
      return errorResponse(400, 'No video file provided', headers);
    }

    if (!targetLanguage || !SUPPORTED_LANGUAGES[targetLanguage]) {
      return errorResponse(400, `Invalid target language. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`, headers);
    }

    console.log(`📹 Processing video: ${fileName} (${fileBuffer.length} bytes) -> ${SUPPORTED_LANGUAGES[targetLanguage]}`);

    // ─────────────────────────────────────────────────────────
    // Call Eleven Labs Dubbing API
    // ─────────────────────────────────────────────────────────
    const FormData = require('form-data');
    const fetch = require('node-fetch');
    
    const formData = new FormData();
    formData.append('file', fileBuffer, { filename: fileName, contentType: fileMimeType });
    formData.append('target_lang', targetLanguage);
    formData.append('source_lang', 'en');
    formData.append('num_speakers', '1');
    formData.append('watermark', 'false');

    const dubResponse = await fetch('https://api.elevenlabs.io/v1/dubbing', {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!dubResponse.ok) {
      const errorText = await dubResponse.text();
      console.error('Eleven Labs error:', errorText);
      return errorResponse(dubResponse.status, `Eleven Labs API error: ${errorText}`, headers);
    }

    const dubResult = await dubResponse.json();
    const dubbingId = dubResult.dubbing_id;

    console.log(`✅ Dubbing job started: ${dubbingId}`);

    // ─────────────────────────────────────────────────────────
    // Save job to database
    // ─────────────────────────────────────────────────────────
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 3); // 3 days from now

    const { data: job, error: insertError } = await supabase
      .from('dubbing_jobs')
      .insert({
        user_id: userId,
        dubbing_id: dubbingId,
        source_language: 'en',
        target_language: targetLanguage,
        original_filename: fileName,
        file_size_bytes: fileBuffer.length,
        status: 'processing',
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save job:', insertError);
      return errorResponse(500, 'Failed to save dubbing job', headers);
    }

    return successResponse({
      success: true,
      jobId: job.id,
      dubbingId: dubbingId,
      status: 'processing',
      targetLanguage: SUPPORTED_LANGUAGES[targetLanguage],
      message: 'Dubbing job started. Poll /dub-status for updates.'
    }, headers);

  } catch (error) {
    console.error('Error in dub-video:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
