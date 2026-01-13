/**
 * Scheduled Price Reduction
 * 
 * F-BG001: Automated price reduction job
 * Runs every 4 hours via Netlify scheduled functions
 * 
 * Calls the process-price-reductions endpoint via HTTP
 */

const https = require('https');

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
  const startTime = Date.now();
  console.log('⏰ Scheduled price reduction triggered at', new Date().toISOString());
  
  try {
    // Get the site URL from environment
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/process-price-reductions`;
    
    console.log(`📡 Calling ${functionUrl}`);
    
    // Call the process-price-reductions function via HTTP
    const response = await httpsPost(functionUrl, {
      internalScheduled: 'netlify-scheduled-function'
    });
    
    let result;
    try {
      result = JSON.parse(response.body);
    } catch (e) {
      result = { raw: response.body };
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
        result
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
