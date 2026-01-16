/**
 * Dub Status - Check dubbing job status and download when complete
 * 
 * GET /dub-status?jobId=xxx
 * 
 * When complete, downloads the dubbed video from Eleven Labs,
 * stores it in Supabase Storage, and returns the download URL.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { decrypt } = require('./utils/encryption');
const fetch = require('node-fetch');

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
    const jobId = event.queryStringParameters?.jobId;

    if (!jobId) {
      return errorResponse(400, 'Missing jobId parameter', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Get job from database
    // ─────────────────────────────────────────────────────────
    const { data: job, error: jobError } = await supabase
      .from('dubbing_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError || !job) {
      return errorResponse(404, 'Dubbing job not found', headers);
    }

    // If already completed, return the stored URL
    if (job.status === 'completed' && job.storage_url) {
      return successResponse({
        success: true,
        status: 'completed',
        downloadUrl: job.storage_url,
        expiresAt: job.expires_at,
        originalFilename: job.original_filename,
        targetLanguage: job.target_language
      }, headers);
    }

    // If failed, return error
    if (job.status === 'failed') {
      return successResponse({
        success: false,
        status: 'failed',
        error: job.error_message || 'Dubbing failed'
      }, headers);
    }

    // ─────────────────────────────────────────────────────────
    // Get user's Eleven Labs API key
    // ─────────────────────────────────────────────────────────
    const { data: apiKeyRecord } = await supabase
      .from('api_keys')
      .select('encrypted_key')
      .eq('user_id', userId)
      .eq('service', 'elevenlabs')
      .single();

    if (!apiKeyRecord) {
      return errorResponse(400, 'Eleven Labs API key not found', headers);
    }

    const elevenLabsKey = decrypt(apiKeyRecord.encrypted_key);

    // ─────────────────────────────────────────────────────────
    // Poll Eleven Labs for status
    // ─────────────────────────────────────────────────────────
    const statusResponse = await fetch(
      `https://api.elevenlabs.io/v1/dubbing/${job.dubbing_id}`,
      {
        headers: { 'xi-api-key': elevenLabsKey }
      }
    );

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error('Eleven Labs status error:', errorText);
      
      // Update job as failed if API returns error
      if (statusResponse.status === 404 || statusResponse.status === 400) {
        await supabase
          .from('dubbing_jobs')
          .update({ status: 'failed', error_message: errorText })
          .eq('id', jobId);
      }
      
      return errorResponse(statusResponse.status, `Failed to check status: ${errorText}`, headers);
    }

    const statusResult = await statusResponse.json();
    console.log(`📊 Dubbing status for ${job.dubbing_id}:`, statusResult.status);

    // Still processing
    if (statusResult.status === 'dubbing' || statusResult.status === 'pending') {
      return successResponse({
        success: true,
        status: 'processing',
        message: 'Dubbing in progress...',
        progress: statusResult.progress_percentage || null
      }, headers);
    }

    // Failed
    if (statusResult.status === 'failed') {
      await supabase
        .from('dubbing_jobs')
        .update({ 
          status: 'failed', 
          error_message: statusResult.error || 'Dubbing failed' 
        })
        .eq('id', jobId);

      return successResponse({
        success: false,
        status: 'failed',
        error: statusResult.error || 'Dubbing failed'
      }, headers);
    }

    // ─────────────────────────────────────────────────────────
    // Completed - Download and store the video
    // ─────────────────────────────────────────────────────────
    if (statusResult.status === 'dubbed') {
      console.log(`✅ Dubbing complete, downloading video...`);

      // Download the dubbed video
      const downloadResponse = await fetch(
        `https://api.elevenlabs.io/v1/dubbing/${job.dubbing_id}/audio/${job.target_language}`,
        {
          headers: { 'xi-api-key': elevenLabsKey }
        }
      );

      if (!downloadResponse.ok) {
        const errorText = await downloadResponse.text();
        console.error('Download error:', errorText);
        return errorResponse(500, `Failed to download dubbed video: ${errorText}`, headers);
      }

      const videoBuffer = await downloadResponse.buffer();
      console.log(`📥 Downloaded ${videoBuffer.length} bytes`);

      // Generate storage path
      const timestamp = Date.now();
      const ext = job.original_filename?.split('.').pop() || 'mp4';
      const storagePath = `${userId}/${timestamp}_${job.target_language}.${ext}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('dubbed-videos')
        .upload(storagePath, videoBuffer, {
          contentType: 'video/mp4',
          upsert: true
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return errorResponse(500, `Failed to store video: ${uploadError.message}`, headers);
      }

      // Get public URL (signed URL for private bucket)
      const { data: urlData } = await supabase.storage
        .from('dubbed-videos')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 3); // 3 day expiry

      const storageUrl = urlData?.signedUrl;

      // Update job record
      await supabase
        .from('dubbing_jobs')
        .update({
          status: 'completed',
          storage_path: storagePath,
          storage_url: storageUrl,
          completed_at: new Date().toISOString()
        })
        .eq('id', jobId);

      console.log(`✅ Video stored: ${storagePath}`);

      return successResponse({
        success: true,
        status: 'completed',
        downloadUrl: storageUrl,
        expiresAt: job.expires_at,
        originalFilename: job.original_filename,
        targetLanguage: job.target_language
      }, headers);
    }

    // Unknown status
    return successResponse({
      success: true,
      status: statusResult.status || 'unknown',
      message: 'Checking status...'
    }, headers);

  } catch (error) {
    console.error('Error in dub-status:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
