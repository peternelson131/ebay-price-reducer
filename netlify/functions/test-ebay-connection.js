const { Handler } = require('@netlify/functions');
const UserEbayClient = require('./utils/user-ebay-client');
const { createClient } = require('@supabase/supabase-js');

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
    // Get authorization header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Authentication required',
          message: 'Please provide a valid authentication token'
        })
      };
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Verify user authentication
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Invalid authentication token',
          message: 'Please log in again'
        })
      };
    }

    // Initialize user-specific eBay client
    const userEbayClient = new UserEbayClient(user.id);
    await userEbayClient.initialize();

    // Check if user has valid eBay connection
    if (!userEbayClient.isConnected()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'eBay account not connected',
          message: 'Please connect your eBay account first',
          redirectTo: '/ebay-setup'
        })
      };
    }

    // Test connection with GeteBayOfficialTime
    const connectionResult = await userEbayClient.makeApiCall(
      '/ws/api.dll',
      'POST',
      {
        'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
        'X-EBAY-API-CALL-NAME': 'GeteBayOfficialTime',
        'X-EBAY-API-SITEID': '0',
        'X-EBAY-API-DEV-NAME': process.env.EBAY_DEV_ID,
        'X-EBAY-API-APP-NAME': process.env.EBAY_APP_ID,
        'X-EBAY-API-CERT-NAME': process.env.EBAY_CERT_ID,
        'RequesterCredentials': {
          'eBayAuthToken': userEbayClient.accessToken
        }
      },
      'trading'
    );

    // Get environment info
    const envInfo = {
      environment: process.env.EBAY_ENVIRONMENT || 'sandbox',
      userId: user.id,
      ebayUserId: userEbayClient.ebayUserId,
      tokenValid: userEbayClient.isConnected()
    };

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