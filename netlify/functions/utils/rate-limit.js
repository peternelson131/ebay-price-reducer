/**
 * Rate Limiting Utility
 * Prevents API abuse by limiting requests per user/IP
 * 
 * Uses in-memory store for simplicity (Netlify Functions are stateless,
 * so this provides rate limiting per function instance)
 * 
 * For production-scale rate limiting, consider using:
 * - Redis (shared state across instances)
 * - Supabase edge functions with built-in rate limiting
 * - CloudFlare rate limiting rules
 */

// In-memory store: key -> { count, resetTime }
const rateLimitStore = new Map();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/**
 * Rate limit configuration
 */
const RATE_LIMITS = {
  // Per-user limits (authenticated requests)
  user: {
    requests: 100,        // Max requests
    windowMs: 60 * 1000   // Per minute
  },
  
  // Per-IP limits (unauthenticated requests)
  ip: {
    requests: 50,
    windowMs: 60 * 1000
  },
  
  // Strict limits for sensitive endpoints
  auth: {
    requests: 10,
    windowMs: 60 * 1000
  }
};

/**
 * Check if request exceeds rate limit
 * @param {string} key - Unique identifier (userId or IP)
 * @param {string} limitType - Type of limit ('user', 'ip', 'auth')
 * @returns {Object} { allowed: boolean, remaining: number, resetTime: number }
 */
function checkRateLimit(key, limitType = 'user') {
  const config = RATE_LIMITS[limitType];
  
  if (!config) {
    throw new Error(`Invalid rate limit type: ${limitType}`);
  }

  const now = Date.now();
  const limitKey = `${limitType}:${key}`;
  
  // Get or create rate limit entry
  let entry = rateLimitStore.get(limitKey);
  
  if (!entry || now >= entry.resetTime) {
    // Create new window
    entry = {
      count: 0,
      resetTime: now + config.windowMs
    };
    rateLimitStore.set(limitKey, entry);
  }

  // Increment counter
  entry.count++;

  // Check if limit exceeded
  const allowed = entry.count <= config.requests;
  const remaining = Math.max(0, config.requests - entry.count);

  return {
    allowed,
    remaining,
    resetTime: entry.resetTime,
    limit: config.requests
  };
}

/**
 * Middleware: Apply rate limiting to Netlify Function
 * @param {Object} event - Netlify event object
 * @param {string} userId - User ID (optional, uses IP if not provided)
 * @param {string} limitType - Type of limit ('user', 'ip', 'auth')
 * @returns {Object|null} Error response if rate limited, null if allowed
 */
function applyRateLimit(event, userId = null, limitType = 'user') {
  // Determine rate limit key
  const key = userId || getClientIp(event);
  
  if (!key) {
    console.warn('Rate limiting: Unable to identify client (no user ID or IP)');
    return null; // Allow request if we can't identify
  }

  // Check rate limit
  const result = checkRateLimit(key, limitType);

  // Return error response if exceeded
  if (!result.allowed) {
    return {
      statusCode: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': result.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
        'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
      },
      body: JSON.stringify({
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${Math.ceil((result.resetTime - Date.now()) / 1000)} seconds.`,
        limit: result.limit,
        resetTime: result.resetTime
      })
    };
  }

  // Add rate limit headers to successful requests
  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
  };

  return { allowed: true, headers };
}

/**
 * Extract client IP from Netlify event
 * @param {Object} event - Netlify event object
 * @returns {string} Client IP address
 */
function getClientIp(event) {
  // Netlify provides client IP in headers
  const headers = event.headers || {};
  
  return (
    headers['x-nf-client-connection-ip'] ||
    headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    headers['x-real-ip'] ||
    'unknown'
  );
}

/**
 * Cleanup expired entries from rate limit store
 */
function cleanup() {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now >= entry.resetTime) {
      rateLimitStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`Rate limit cleanup: Removed ${cleaned} expired entries`);
  }
}

// Run cleanup periodically
if (typeof setInterval !== 'undefined') {
  setInterval(cleanup, CLEANUP_INTERVAL);
}

module.exports = {
  applyRateLimit,
  checkRateLimit,
  getClientIp,
  RATE_LIMITS
};
