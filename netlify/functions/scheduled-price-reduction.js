/**
 * Scheduled Price Reduction
 * 
 * F-BG001: Automated price reduction job
 * Runs every 4 hours via Netlify scheduled functions
 * 
 * Calls the process-price-reductions endpoint via HTTP
 * to ensure proper environment variable loading.
 */

const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const startTime = Date.now();
  console.log('⏰ Scheduled price reduction triggered at', new Date().toISOString());
  
  try {
    // Get the site URL from environment or construct it
    const siteUrl = process.env.URL || 'https://dainty-horse-49c336.netlify.app';
    const functionUrl = `${siteUrl}/.netlify/functions/process-price-reductions`;
    
    console.log(`📡 Calling ${functionUrl}`);
    
    // Call the process-price-reductions function via HTTP
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        internalScheduled: 'netlify-scheduled-function'
      })
    });
    
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      result = { raw: responseText };
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    if (response.ok) {
      console.log(`✅ Scheduled price reduction completed in ${duration}s`);
      console.log(`📊 Stats:`, JSON.stringify(result.stats || result, null, 2));
    } else {
      console.error(`❌ Price reduction failed with status ${response.status}`);
      console.error(`Response:`, responseText);
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
        error: error.message,
        stack: error.stack
      })
    };
  }
};
