/**
 * Minimal test function to debug Keepa API
 */

const { getCorsHeaders } = require('./utils/cors');
const axios = require('axios');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const keepaKey = process.env.KEEPA_API_KEY;
    
    if (!keepaKey) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ error: 'No KEEPA_API_KEY env var', envKeys: Object.keys(process.env).filter(k => k.includes('KEEPA') || k.includes('SUPABASE')) })
      };
    }
    
    // Simple Keepa test
    const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=B0DMVWYDXR`;
    
    console.log('Testing Keepa API...');
    const response = await axios.get(url, { decompress: true, timeout: 10000 });
    
    const product = response.data.products?.[0];
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        title: product?.title?.substring(0, 50) || 'Unknown',
        variations: product?.variations?.length || 0,
        tokensLeft: response.data.tokensLeft
      })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5)
      })
    };
  }
};
