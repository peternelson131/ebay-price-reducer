/**
 * Shared CORS and Security Headers utility for Netlify Functions
 * Implements origin-based CORS validation and security headers
 */

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'https://opsyncpro.io',
      'https://www.opsyncpro.io',
      'https://dainty-horse-49c336.netlify.app',
      'https://ebay-price-reducer-public-platform.netlify.app',
      'http://localhost:5173',
      'http://localhost:8888'
    ];

/**
 * Security headers to include in all responses
 */
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

/**
 * Get CORS headers with security headers included
 * @param {Object} event - Netlify function event
 * @returns {Object} - Headers object
 */
function getCorsHeaders(event) {
  const requestOrigin = event.headers.origin || event.headers.Origin;
  
  // Allow Chrome extensions (chrome-extension://...) and listed origins
  const isAllowed = ALLOWED_ORIGINS.includes(requestOrigin) || 
    (requestOrigin && requestOrigin.startsWith('chrome-extension://'));
  
  const allowedOrigin = isAllowed ? requestOrigin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    ...SECURITY_HEADERS
  };
}

/**
 * Handle OPTIONS preflight request
 * @param {Object} event - Netlify function event
 * @returns {Object|null} - Response for OPTIONS, null otherwise
 */
function handlePreflight(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: getCorsHeaders(event),
      body: ''
    };
  }
  return null;
}

/**
 * Create error response with proper headers
 * @param {number} statusCode - HTTP status code
 * @param {string} error - Error message  
 * @param {Object} headers - Headers object
 * @returns {Object} - Netlify function response
 */
function errorResponse(statusCode, error, headers) {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ error })
  };
}

/**
 * Create success response with proper headers
 * @param {Object} data - Response data
 * @param {Object} headers - Headers object
 * @param {number} statusCode - HTTP status code (default 200)
 * @returns {Object} - Netlify function response
 */
function successResponse(data, headers, statusCode = 200) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(data)
  };
}

module.exports = { 
  getCorsHeaders, 
  handlePreflight,
  errorResponse,
  successResponse,
  ALLOWED_ORIGINS,
  SECURITY_HEADERS
};
