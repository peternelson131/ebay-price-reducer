/**
 * Log Sanitization Utility
 * Prevents sensitive data from appearing in logs
 * 
 * SECURITY: Never log tokens, passwords, or other sensitive data
 */

/**
 * Patterns to detect and redact sensitive data
 */
const SENSITIVE_PATTERNS = [
  // OAuth tokens (Bearer tokens, access tokens)
  { 
    pattern: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'Bearer [REDACTED]'
  },
  {
    pattern: /"access_token"\s*:\s*"[^"]+"/gi,
    replacement: '"access_token":"[REDACTED]"'
  },
  {
    pattern: /"refresh_token"\s*:\s*"[^"]+"/gi,
    replacement: '"refresh_token":"[REDACTED]"'
  },
  {
    pattern: /access_token=[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'access_token=[REDACTED]'
  },
  
  // API keys
  {
    pattern: /"api_key"\s*:\s*"[^"]+"/gi,
    replacement: '"api_key":"[REDACTED]"'
  },
  {
    pattern: /api_key=[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'api_key=[REDACTED]'
  },
  
  // Client secrets
  {
    pattern: /"client_secret"\s*:\s*"[^"]+"/gi,
    replacement: '"client_secret":"[REDACTED]"'
  },
  {
    pattern: /client_secret=[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'client_secret=[REDACTED]'
  },
  
  // Passwords
  {
    pattern: /"password"\s*:\s*"[^"]+"/gi,
    replacement: '"password":"[REDACTED]"'
  },
  
  // Authorization headers
  {
    pattern: /Authorization:\s*[^\s]+/gi,
    replacement: 'Authorization: [REDACTED]'
  },
  
  // Email addresses (partial redaction - keep domain visible)
  {
    pattern: /([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+)/g,
    replacement: (match, user, domain) => {
      const redactedUser = user.length > 2 
        ? user[0] + '*'.repeat(user.length - 2) + user[user.length - 1]
        : '**';
      return `${redactedUser}@${domain}`;
    }
  }
];

/**
 * Sanitize a string by removing sensitive data
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitize(text) {
  if (typeof text !== 'string') {
    return text;
  }

  let sanitized = text;
  
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, replacement);
  }
  
  return sanitized;
}

/**
 * Sanitize an object (useful for logging request/response objects)
 * @param {Object} obj - Object to sanitize
 * @param {number} maxDepth - Maximum recursion depth
 * @returns {Object} Sanitized copy of object
 */
function sanitizeObject(obj, maxDepth = 5) {
  if (maxDepth === 0 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj !== 'object') {
    return typeof obj === 'string' ? sanitize(obj) : obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, maxDepth - 1));
  }

  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Completely redact sensitive keys
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('authorization') ||
      lowerKey.includes('api_key') ||
      lowerKey.includes('apikey') ||
      lowerKey === 'cookie' ||
      lowerKey === 'auth'
    ) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      sanitized[key] = sanitize(value);
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, maxDepth - 1);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Safe console.log wrapper that sanitizes all arguments
 */
function safeLog(...args) {
  const sanitizedArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return sanitize(arg);
    } else if (typeof arg === 'object') {
      return sanitizeObject(arg);
    }
    return arg;
  });
  
  console.log(...sanitizedArgs);
}

/**
 * Safe console.error wrapper that sanitizes all arguments
 */
function safeError(...args) {
  const sanitizedArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return sanitize(arg);
    } else if (typeof arg === 'object') {
      return sanitizeObject(arg);
    }
    return arg;
  });
  
  console.error(...sanitizedArgs);
}

/**
 * Safe console.warn wrapper that sanitizes all arguments
 */
function safeWarn(...args) {
  const sanitizedArgs = args.map(arg => {
    if (typeof arg === 'string') {
      return sanitize(arg);
    } else if (typeof arg === 'object') {
      return sanitizeObject(arg);
    }
    return arg;
  });
  
  console.warn(...sanitizedArgs);
}

module.exports = {
  sanitize,
  sanitizeObject,
  safeLog,
  safeError,
  safeWarn
};
