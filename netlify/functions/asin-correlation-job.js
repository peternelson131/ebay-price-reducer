/**
 * ASIN Correlation Job Manager
 * 
 * Manages background correlation jobs:
 * - POST action=start: Create job and trigger background processing
 * - GET action=status: Check job status
 * - GET action=list: List recent jobs
 * 
 * This is the synchronous endpoint that clients call.
 * It creates jobs and triggers the background function.
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { decrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get user's API key
async function getUserApiKey(userId, service) {
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', service)
    .single();
  
  if (error || !data) return null;
  
  try {
    return decrypt(data.api_key_encrypted);
  } catch (e) {
    return data.api_key_encrypted; // Might not be encrypted in dev
  }
}

// Trigger the background function
async function triggerBackgroundFunction(jobId, asin, userId, keepaKey, requestHost) {
  // Use request host if available, then process.env.URL, then fallback
  let baseUrl;
  if (requestHost) {
    const protocol = requestHost.includes('localhost') ? 'http' : 'https';
    baseUrl = `${protocol}://${requestHost}`;
  } else {
    baseUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
  }
  const functionUrl = `${baseUrl}/.netlify/functions/trigger-asin-correlation-background`;
  
  console.log(`🚀 Triggering background function at ${functionUrl}`);
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Webhook-Secret': process.env.WEBHOOK_SECRET || ''
    },
    body: JSON.stringify({ jobId, asin, userId, keepaKey })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to trigger background function: ${response.status} - ${error}`);
  }
  
  // Background functions may return empty body or non-JSON
  const text = await response.text();
  return text ? JSON.parse(text) : { ok: true };
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    // Auth
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    
    // Parse request
    const isGet = event.httpMethod === 'GET';
    const params = isGet 
      ? event.queryStringParameters || {}
      : JSON.parse(event.body || '{}');
    
    const action = params.action || 'status';
    
    // ==================== ACTION: START ====================
    if (action === 'start') {
      const { asin, keepaKey: providedKey } = params;
      
      if (!asin || !/^B[0-9A-Z]{9}$/i.test(asin)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Valid ASIN required (B + 9 chars)' })
        };
      }
      
      const normalizedAsin = asin.toUpperCase();
      
      // Get Keepa key
      let keepaKey = providedKey;
      if (!keepaKey) {
        keepaKey = await getUserApiKey(user.id, 'keepa');
      }
      if (!keepaKey) {
        keepaKey = process.env.KEEPA_API_KEY;
      }
      if (!keepaKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Keepa API key required',
            message: 'Please add your Keepa API key in Settings > API Keys'
          })
        };
      }
      
      // Check for existing pending/processing job
      const { data: existingJobs } = await supabase
        .from('import_jobs')
        .select('id, status, created_at')
        .eq('user_id', user.id)
        .eq('search_asin', normalizedAsin)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (existingJobs?.length > 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            message: 'Job already in progress',
            jobId: existingJobs[0].id,
            status: existingJobs[0].status,
            alreadyRunning: true
          })
        };
      }
      
      // Create new job
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          user_id: user.id,
          search_asin: normalizedAsin,
          status: 'pending'
        })
        .select()
        .single();
      
      if (jobError) {
        console.error('Failed to create job:', jobError);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to create job' })
        };
      }
      
      console.log(`✅ Created job ${job.id} for ASIN ${normalizedAsin}`);
      
      // Trigger background function
      try {
        const requestHost = event.headers.host || event.headers.Host;
        await triggerBackgroundFunction(job.id, normalizedAsin, user.id, keepaKey, requestHost);
        console.log('✅ Background function triggered');
      } catch (triggerError) {
        console.error('Failed to trigger background function:', triggerError);
        
        // Update job status to error
        await supabase
          .from('import_jobs')
          .update({ status: 'error', error_message: triggerError.message })
          .eq('id', job.id);
        
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: 'Failed to start background processing',
            message: triggerError.message,
            jobId: job.id
          })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Background processing started',
          jobId: job.id,
          asin: normalizedAsin,
          status: 'pending'
        })
      };
    }
    
    // ==================== ACTION: STATUS ====================
    if (action === 'status') {
      const { jobId } = params;
      
      if (!jobId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'jobId required' })
        };
      }
      
      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('id', jobId)
        .eq('user_id', user.id)
        .single();
      
      if (jobError || !job) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Job not found' })
        };
      }
      
      // If complete, also fetch the correlations
      let correlations = [];
      if (job.status === 'complete') {
        const { data: corrs } = await supabase
          .from('asin_correlations')
          .select('*')
          .eq('user_id', user.id)
          .eq('search_asin', job.search_asin);
        
        correlations = (corrs || []).map(row => ({
          asin: row.similar_asin,
          title: row.correlated_title,
          imageUrl: row.image_url,
          searchImageUrl: row.search_image_url,
          suggestedType: row.suggested_type,
          source: row.source,
          url: row.correlated_amazon_url
        }));
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          job: {
            id: job.id,
            asin: job.search_asin,
            status: job.status,
            totalCount: job.total_count,
            processedCount: job.processed_count,
            approvedCount: job.approved_count,
            rejectedCount: job.rejected_count,
            errorMessage: job.error_message,
            createdAt: job.created_at,
            completedAt: job.completed_at
          },
          correlations,
          isComplete: job.status === 'complete' || job.status === 'error'
        })
      };
    }
    
    // ==================== ACTION: LIST ====================
    if (action === 'list') {
      const limit = parseInt(params.limit) || 10;
      
      const { data: jobs, error: jobsError } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (jobsError) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch jobs' })
        };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          jobs: (jobs || []).map(j => ({
            id: j.id,
            asin: j.search_asin,
            status: j.status,
            totalCount: j.total_count,
            approvedCount: j.approved_count,
            rejectedCount: j.rejected_count,
            createdAt: j.created_at,
            completedAt: j.completed_at
          }))
        })
      };
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action. Use: start, status, or list' })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
