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

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      })
    };
  }

  try {
    // Parse request body
    const requestBody = JSON.parse(event.body || '{}');
    const { itemId, newPrice } = requestBody;

    // Validate required parameters
    if (!itemId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required parameter',
          message: 'itemId is required'
        })
      };
    }

    if (!newPrice || isNaN(parseFloat(newPrice))) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid price',
          message: 'newPrice must be a valid number'
        })
      };
    }

    // Initialize eBay client
    const ebayClient = new EbayClient();

    // Format price properly (2 decimal places)
    const formattedPrice = ebayClient.formatPrice(newPrice);

    // Update item price
    const response = await ebayClient.reviseItemPrice(itemId, formattedPrice);

    // Check for eBay API errors in response
    if (response && response.Ack && response.Ack !== 'Success') {
      const errorMessage = response.Errors
        ? (Array.isArray(response.Errors) ? response.Errors[0].LongMessage : response.Errors.LongMessage)
        : 'Unknown eBay API error';

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'eBay API Error',
          message: errorMessage,
          ebayResponse: response
        })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `Successfully updated price for item ${itemId}`,
        itemId: itemId,
        newPrice: formattedPrice,
        ebayResponse: {
          ack: response.Ack,
          timestamp: response.Timestamp,
          itemId: response.ItemID
        },
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Failed to update item price:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        message: 'Failed to update item price',
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };