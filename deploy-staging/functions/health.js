/**
 * Health Check Endpoint
 * 
 * Simple endpoint for uptime monitoring that returns immediately.
 * For detailed diagnostics, use /health-detailed
 */

const { getCorsHeaders } = require('./utils/cors');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  // Simple health check - just confirm the function is running
  return {
    statusCode: 200,
    headers: {
      ...headers,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Health-Check': 'true'
    },
    body: JSON.stringify({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0'
    })
  };
};
