/**
 * Scheduled Price Reduction - F-BG001
 * 
 * Runs every 4 hours via Netlify scheduled functions
 * NOTE: Cannot be manually invoked via HTTP when schedule is active
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
  console.log('⏰ Scheduled price reduction triggered at', new Date().toISOString());
  
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
    // Get the site URL from environment
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/process-price-reductions`;
    
    console.log(`📡 Calling ${functionUrl}`);
    
    // Call the process-price-reductions function via HTTP with webhook secret
    const webhookSecret = process.env.WEBHOOK_SECRET;
    const response = await httpsPost(functionUrl, {}, {
      'X-Webhook-Secret': webhookSecret
    });
    
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      result = { raw: response.body.substring(0, 500) };
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.status === 200) {
      console.log(`✅ Scheduled price reduction completed in ${duration}s`);
      console.log(`📊 Stats:`, JSON.stringify(result.stats || {}, null, 2));
    } else {
      console.error(`❌ Price reduction failed with status ${response.status}`);
      console.error(`Response:`, response.body.substring(0, 500));
    }
    
    return {
      statusCode: response.status,
      body: JSON.stringify({
        scheduled: true,
        duration: `${duration}s`,
        stats: result.stats,
        success: response.status === 200
      })
    };
    
  } catch (error) {
    console.error('❌ Scheduled price reduction failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
