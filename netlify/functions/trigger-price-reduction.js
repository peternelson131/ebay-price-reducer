/**
 * Manual Price Reduction Trigger
 * 
 * HTTP endpoint for manually triggering price reductions
 * Use this for testing since scheduled functions can't be invoked via HTTP
 * 
 * SECURITY: Requires either:
 *   - Valid JWT Bearer token (for user-initiated triggers)
 *   - Valid webhook secret (for automated/scheduled triggers)
 * 
 * POST /trigger-price-reduction
 * Body: { "dryRun": true/false }
 */

const https = require('https');
const { getCorsHeaders, handlePreflight, errorResponse } = require('./utils/cors');
const { verifyAuthOrWebhook } = require('./utils/auth');

function httpsPost(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(data);
    
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
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

  const startTime = Date.now();
  console.log('🔧 Manual price reduction trigger at', new Date().toISOString());
  
  try {
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication or webhook secret
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuthOrWebhook(event);
    if (!authResult.success) {
      console.log('Auth failed:', authResult.error);
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    console.log(`✅ Authenticated via ${authResult.isWebhook ? 'webhook secret' : 'JWT token'}`);
    
    const body = event.body ? JSON.parse(event.body) : {};
    const dryRun = body.dryRun !== false; // Default to dry run for safety
    const limit = body.limit || null; // Optional limit for testing
    
    // Get the site URL from environment
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/process-price-reductions`;
    
    console.log(`📡 Calling ${functionUrl} (dryRun: ${dryRun})`);
    
    // Call process-price-reductions
    const response = await httpsPost(functionUrl, {
      internalScheduled: 'netlify-scheduled-function',
      dryRun: dryRun,
      limit: limit
    });
    
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      result = { raw: response.body.substring(0, 500) };
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    return {
      statusCode: response.status,
      headers,
      body: JSON.stringify({
        triggered: true,
        dryRun: dryRun,
        duration: `${duration}s`,
        stats: result.stats,
        success: response.status === 200
      })
    };
    
  } catch (error) {
    console.error('❌ Manual trigger failed:', error);
    // Don't leak internal error details
    return errorResponse(500, 'Failed to trigger price reduction', headers);
  }
};
