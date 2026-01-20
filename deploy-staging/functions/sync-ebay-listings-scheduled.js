/**
 * Scheduled eBay Listing Sync
 * 
 * Runs hourly via Netlify scheduled functions
 * Syncs listings from eBay (Trading API + Inventory API)
 */

const https = require('https');
const { verifyWebhookSecret } = require('./utils/auth');

function httpsPost(url, data, extraHeaders = {}) {
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
        'Content-Length': Buffer.byteLength(postData),
        ...extraHeaders
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
  const startTime = Date.now();
  console.log('🔄 Scheduled eBay sync triggered at', new Date().toISOString());
  
  // Allow Netlify scheduled invocations (no body) OR require webhook secret for manual calls
  const body = event.body ? JSON.parse(event.body) : {};
  const isScheduledInvocation = !event.body || Object.keys(body).length === 0;
  const hasInternalMarker = body.internalScheduled === 'netlify-scheduled-function';
  
  if (!isScheduledInvocation && !hasInternalMarker) {
    // Manual HTTP call - require webhook secret
    const authResult = verifyWebhookSecret(event);
    if (!authResult.success) {
      console.error('❌ Authentication failed for manual invocation:', authResult.error);
      return {
        statusCode: authResult.statusCode || 401,
        body: JSON.stringify({ error: authResult.error })
      };
    }
    console.log('✅ Webhook secret verified for manual invocation');
  } else {
    console.log('✅ Scheduled/internal invocation detected');
  }
  
  try {
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/sync-ebay-listings`;
    
    console.log(`📡 Calling ${functionUrl}`);
    
    // Call sync function - limit to prevent timeout
    // ~50 listings/user takes ~17s, so 50 * 2 users = ~35s, safe for 60s timeout
    const response = await httpsPost(functionUrl, {
      internalScheduled: 'netlify-scheduled-function',
      maxListings: 50  // Process 50/user to stay within 60s timeout
    });
    
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      result = { raw: response.body.substring(0, 500) };
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.status === 200) {
      console.log(`✅ Scheduled sync completed in ${duration}s`);
      console.log(`📊 Results:`, JSON.stringify(result.results || {}, null, 2));
    } else {
      console.error(`❌ Sync failed with status ${response.status}`);
    }
    
    return {
      statusCode: response.status,
      body: JSON.stringify({
        scheduled: true,
        duration: `${duration}s`,
        success: response.status === 200,
        results: result.results
      })
    };
    
  } catch (error) {
    console.error('❌ Scheduled sync failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
