const { Handler } = require('@netlify/functions');
const EbayClient = require('./utils/ebay-client');

const handler = async (event, context) => {
  // Set CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Initialize eBay client
    const ebayClient = new EbayClient();

    // Test connection with GeteBayOfficialTime
    const connectionResult = await ebayClient.testConnection();

    // Get environment info
    const envInfo = ebayClient.getEnvironmentInfo();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'eBay API connection test completed',
        connectionTest: connectionResult,
        environment: envInfo,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('eBay connection test failed:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'eBay API connection test failed',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };