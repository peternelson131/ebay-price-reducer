/**
 * Test AfterShip API connection
 */
exports.handler = async (event, context) => {
  console.log('Testing AfterShip API connection...');
  
  try {
    const axios = require('axios');
    const AFTERSHIP_API_KEY = 'asat_4b7e17c41aa44c4ba2ae410f82e7b347';
    
    console.log('Making AfterShip API call...');
    const response = await axios.get(
      'https://api.aftership.com/tracking/2024-10/trackings',
      {
        headers: {
          'as-api-key': AFTERSHIP_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('AfterShip API success:', response.data);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        trackings: response.data?.data?.trackings?.length || 0,
        message: 'AfterShip API working'
      })
    };
  } catch (error) {
    console.error('AfterShip API error:', error.message);
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