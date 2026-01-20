/**
 * Dub Video - Start Eleven Labs dubbing job
 * 
 * POST /dub-video
 * Body: { "storageUrl": "supabase-storage-url", "targetLanguage": "es", "originalFilename": "video.mp4" }
 * 
 * The video should be uploaded to Supabase Storage first (client-side),
 * then this function is called with the storage URL.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { decrypt } = require('./utils/encryption');
const fetch = require('node-fetch');
const FormData = require('form-data');

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

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  console.log('📥 dub-video called');

  try {
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      console.log('❌ Auth failed:', authResult.error);
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    console.log(`✅ Authenticated user: ${userId}`);

    // ─────────────────────────────────────────────────────────
    // Parse request body
    // ─────────────────────────────────────────────────────────
    const body = JSON.parse(event.body || '{}');
    const { storagePath, targetLanguage, originalFilename } = body;

    if (!storagePath) {
      return errorResponse(400, 'Missing storagePath - upload video to storage first', headers);
    }

    if (!targetLanguage || !SUPPORTED_LANGUAGES[targetLanguage]) {
      return errorResponse(400, `Invalid target language. Supported: ${Object.keys(SUPPORTED_LANGUAGES).join(', ')}`, headers);
    }

    console.log(`📹 Processing: ${originalFilename} -> ${SUPPORTED_LANGUAGES[targetLanguage]}`);

    // ─────────────────────────────────────────────────────────
    // Get user's Eleven Labs API key
    // ─────────────────────────────────────────────────────────
    const { data: apiKeyRecord, error: keyError } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('service', 'elevenlabs')
      .single();

    if (keyError || !apiKeyRecord) {
      return errorResponse(400, 'Eleven Labs API key not configured. Please add it in API Keys settings.', headers);
    }

    const elevenLabsKey = decrypt(apiKeyRecord.api_key_encrypted);
    if (!elevenLabsKey) {
      return errorResponse(500, 'Failed to decrypt API key', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Download video from Supabase Storage
    // ─────────────────────────────────────────────────────────
    console.log(`📥 Downloading from storage: ${storagePath}`);
    
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('dubbed-videos')
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return errorResponse(400, `Failed to download video: ${downloadError?.message || 'File not found'}`, headers);
    }

    const videoBuffer = Buffer.from(await fileData.arrayBuffer());
    console.log(`📥 Downloaded ${videoBuffer.length} bytes`);

    // ─────────────────────────────────────────────────────────
    // Call Eleven Labs Dubbing API
    // ─────────────────────────────────────────────────────────
    const formData = new FormData();
    formData.append('file', videoBuffer, { 
      filename: originalFilename || 'video.mp4', 
      contentType: 'video/mp4' 
    });
    formData.append('target_lang', targetLanguage);
    formData.append('source_lang', 'en');
    formData.append('num_speakers', '1');
    formData.append('watermark', 'false');

    console.log('🎬 Calling Eleven Labs API...');
    
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
        original_filename: originalFilename,
        file_size_bytes: videoBuffer.length,
        status: 'processing',
        expires_at: expiresAt.toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to save job:', insertError);
      return errorResponse(500, 'Failed to save dubbing job', headers);
    }

    // Delete the source file from storage (we don't need it anymore)
    await supabase.storage.from('dubbed-videos').remove([storagePath]);

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
