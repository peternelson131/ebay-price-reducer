/**
 * Social Post Status - Check status of async social media post jobs
 * GET /social-post-status?jobId=xxx
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

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;
    const { jobId } = event.queryStringParameters || {};

    if (!jobId) {
      return errorResponse(400, 'jobId query parameter is required', headers);
    }

    // Get job status
    const { data: job, error: jobError } = await supabase
      .from('social_post_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .single();

    if (jobError) {
      if (jobError.code === 'PGRST116') {
        return errorResponse(404, 'Job not found', headers);
      }
      console.error('Database error:', jobError);
      return errorResponse(500, 'Failed to fetch job status', headers);
    }

    if (!job) {
      return errorResponse(404, 'Job not found', headers);
    }

    return successResponse({
      jobId: job.id,
      status: job.status,
      videoId: job.video_id,
      platforms: job.platforms,
      title: job.title,
      description: job.description,
      results: job.results,
      error: job.error,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    }, headers);

  } catch (error) {
    console.error('Social post status error:', error);
    return errorResponse(500, error.message || 'Failed to get job status', headers);
  }
};
