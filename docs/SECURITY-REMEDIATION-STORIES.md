# Security Remediation User Stories

**Created:** January 16, 2026  
**Priority:** Critical → High → Medium  
**Goal:** Secure all endpoints and prevent data leakage without disrupting functionality

---

## Epic: API Endpoint Security

### STORY-SEC-001: Protect Admin Endpoints with Authentication
**Priority:** 🔴 Critical  
**Estimate:** 2 hours

**As a** system administrator  
**I want** all admin endpoints protected by authentication  
**So that** unauthorized users cannot access sensitive business data

**Affected Endpoints:**
- `admin-get-locations.js`

**Acceptance Criteria:**
- [ ] Endpoint requires valid JWT Bearer token
- [ ] Returns 401 Unauthorized if no token provided
- [ ] Returns 403 Forbidden if token is invalid/expired
- [ ] Authorized users receive normal response
- [ ] Error messages do not leak internal details

**Testing Criteria:**
```bash
# Test 1: No auth should fail
curl -s https://[site]/.netlify/functions/admin-get-locations
# Expected: {"error":"Unauthorized"}, status 401

# Test 2: Invalid token should fail  
curl -s -H "Authorization: Bearer invalid" https://[site]/.netlify/functions/admin-get-locations
# Expected: {"error":"Invalid token"}, status 401

# Test 3: Valid token should work
curl -s -H "Authorization: Bearer [valid_jwt]" https://[site]/.netlify/functions/admin-get-locations
# Expected: {"success":true,"locations":[...]}, status 200

# Test 4: Frontend still works
# Navigate to Quick List page → locations should load
```

**Implementation:**
```javascript
// Add to top of handler:
const { verifyAuth } = require('./utils/auth');

exports.handler = async (event) => {
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return {
      statusCode: authResult.statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: authResult.error })
    };
  }
  const userId = authResult.userId;
  // ... rest of function
};
```

---

### STORY-SEC-002: Protect Background Job Triggers
**Priority:** 🔴 Critical  
**Estimate:** 3 hours

**As a** system  
**I want** background job endpoints protected by secrets  
**So that** attackers cannot trigger expensive operations or manipulate data

**Affected Endpoints:**
- `trigger-price-reduction.js`
- `trigger-asin-correlation-background.js`
- `scheduled-price-reduction.js`
- `sync-ebay-listings-scheduled.js`

**Acceptance Criteria:**
- [ ] Endpoints require either:
  - Valid JWT token (for user-triggered), OR
  - Valid webhook secret (for scheduled jobs)
- [ ] Webhook secret is stored in environment variables
- [ ] Returns 401/403 without valid credentials
- [ ] Scheduled jobs from Netlify still work
- [ ] Manual triggers from authenticated users still work

**Testing Criteria:**
```bash
# Test 1: No auth should fail
curl -X POST https://[site]/.netlify/functions/trigger-price-reduction
# Expected: {"error":"Unauthorized"}, status 401

# Test 2: Invalid secret should fail
curl -X POST -H "X-Webhook-Secret: wrong" https://[site]/.netlify/functions/trigger-price-reduction
# Expected: {"error":"Unauthorized"}, status 401

# Test 3: Valid webhook secret should work
curl -X POST -H "X-Webhook-Secret: [env_secret]" https://[site]/.netlify/functions/trigger-price-reduction
# Expected: Success response, status 200

# Test 4: Valid JWT should work (for user triggers)
curl -X POST -H "Authorization: Bearer [valid_jwt]" https://[site]/.netlify/functions/trigger-price-reduction
# Expected: Success response, status 200

# Test 5: Netlify scheduled function still triggers
# Check Netlify function logs after scheduled time
```

**Environment Variable to Add:**
```
WEBHOOK_SECRET=<generate-64-char-random-string>
```

---

### STORY-SEC-003: Remove or Protect Test Endpoints
**Priority:** 🔴 Critical  
**Estimate:** 1 hour

**As a** security-conscious developer  
**I want** test endpoints removed from production  
**So that** they cannot be exploited by attackers

**Affected Endpoints:**
- `test-category-functions.js`
- `test-quick-list-create.js`
- `test-quick-list-settings.js`
- `test-quicklist-suite.js`
- `test-quicklist-v2.js`
- `test-regression.js`
- `test-story-5.js`
- `test-story-6.js`

**Acceptance Criteria:**
- [ ] Test files moved to `__tests__/` directory (not deployed)
- [ ] OR test endpoints require admin auth + `NODE_ENV !== 'production'`
- [ ] Production deployment does not include test functions
- [ ] Local development still has access to test functions

**Testing Criteria:**
```bash
# Test 1: Test endpoints should not exist in production
curl -s https://[site]/.netlify/functions/test-quick-list-create
# Expected: 404 Not Found

# Test 2: Local dev should still work (if kept)
netlify dev
curl -s http://localhost:8888/.netlify/functions/test-quick-list-create
# Expected: Function executes (locally only)
```

**Implementation Option A - Move to __tests__:**
```bash
mkdir -p netlify/functions/__tests__
mv netlify/functions/test-*.js netlify/functions/__tests__/
```

**Implementation Option B - Add to netlify.toml:**
```toml
[functions]
  # Exclude test files from deployment
  included_files = ["!netlify/functions/test-*.js"]
```

---

### STORY-SEC-004: Add Security Headers to All Responses
**Priority:** 🟠 High  
**Estimate:** 2 hours

**As a** user  
**I want** the application to include security headers  
**So that** I'm protected from XSS, clickjacking, and other attacks

**Acceptance Criteria:**
- [ ] All responses include security headers
- [ ] Headers applied via shared utility function
- [ ] No functionality broken by new headers

**Security Headers to Add:**
```javascript
const securityHeaders = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};
```

**Testing Criteria:**
```bash
# Test 1: Check headers on any endpoint
curl -I https://[site]/.netlify/functions/health
# Expected: Should include X-Frame-Options, X-Content-Type-Options, etc.

# Test 2: Verify frontend still embeds correctly (if needed)
# Test 3: Verify API calls still work from frontend
```

---

### STORY-SEC-005: Restrict CORS to Allowed Origins
**Priority:** 🟠 High  
**Estimate:** 2 hours

**As a** security-conscious developer  
**I want** CORS restricted to my application domains  
**So that** other websites cannot make API calls on behalf of users

**Acceptance Criteria:**
- [ ] CORS only allows specific origins:
  - `https://dainty-horse-49c336.netlify.app` (UAT)
  - `https://ebay-price-reducer-public-platform.netlify.app` (Prod)
  - `http://localhost:5173` (Local dev)
- [ ] Preflight OPTIONS requests handled correctly
- [ ] Cross-origin requests from other domains blocked
- [ ] Same-origin requests continue to work

**Testing Criteria:**
```bash
# Test 1: Request from allowed origin should work
curl -H "Origin: https://dainty-horse-49c336.netlify.app" \
     -I https://[site]/.netlify/functions/health
# Expected: Access-Control-Allow-Origin: https://dainty-horse-49c336.netlify.app

# Test 2: Request from disallowed origin should fail
curl -H "Origin: https://evil-site.com" \
     -I https://[site]/.netlify/functions/health
# Expected: No Access-Control-Allow-Origin header OR different origin

# Test 3: Frontend API calls still work
# Navigate through app, verify all API calls succeed
```

**Implementation:**
```javascript
// utils/cors.js
const ALLOWED_ORIGINS = [
  'https://dainty-horse-49c336.netlify.app',
  'https://ebay-price-reducer-public-platform.netlify.app',
  'http://localhost:5173',
  'http://localhost:8888'
];

function getCorsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin;
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };
}
```

---

### STORY-SEC-006: Implement Rate Limiting
**Priority:** 🟠 High  
**Estimate:** 4 hours

**As a** system administrator  
**I want** API rate limiting in place  
**So that** attackers cannot abuse the API or exhaust resources

**Acceptance Criteria:**
- [ ] Rate limiting per IP address (unauthenticated)
- [ ] Rate limiting per user ID (authenticated)
- [ ] Limits:
  - 100 requests/minute for general endpoints
  - 10 requests/minute for expensive operations (sync, ASIN lookup)
- [ ] Returns 429 Too Many Requests when exceeded
- [ ] Rate limit headers included in responses
- [ ] Normal usage not affected

**Testing Criteria:**
```bash
# Test 1: Normal usage should work
for i in {1..10}; do curl -s https://[site]/.netlify/functions/health; done
# Expected: All succeed

# Test 2: Exceeding limit should fail
for i in {1..150}; do curl -s https://[site]/.netlify/functions/health; done
# Expected: Later requests return 429

# Test 3: Rate limit headers present
curl -I https://[site]/.netlify/functions/health
# Expected: X-RateLimit-Limit, X-RateLimit-Remaining headers
```

**Implementation Options:**
1. Use Supabase table to track request counts
2. Use Upstash Redis for distributed rate limiting
3. Use Netlify Edge Functions for edge-based limiting

---

### STORY-SEC-007: Sanitize Error Messages
**Priority:** 🟡 Medium  
**Estimate:** 2 hours

**As a** security-conscious developer  
**I want** error messages sanitized  
**So that** attackers cannot learn about system internals

**Acceptance Criteria:**
- [ ] No stack traces in production responses
- [ ] No internal paths or file names exposed
- [ ] No database column names in errors
- [ ] Generic "An error occurred" for unexpected errors
- [ ] Detailed errors logged server-side only

**Testing Criteria:**
```bash
# Test 1: Trigger an error, verify generic message
curl -X POST https://[site]/.netlify/functions/auto-list-single \
     -H "Authorization: Bearer [token]" \
     -d '{"invalid": "data"}'
# Expected: Generic error, no stack trace

# Test 2: Check Netlify logs for detailed error
# Verify detailed error IS logged for debugging
```

**Implementation:**
```javascript
// utils/errors.js
function sanitizeError(error, context) {
  // Log full error for debugging
  console.error(`[${context}] Error:`, error);
  
  // Return generic message to client
  if (process.env.NODE_ENV === 'production') {
    return { error: 'An error occurred. Please try again.' };
  }
  
  // In development, return more detail
  return { error: error.message };
}
```

---

### STORY-SEC-008: Add Input Validation
**Priority:** 🟡 Medium  
**Estimate:** 4 hours

**As a** developer  
**I want** all inputs validated  
**So that** injection attacks are prevented

**Acceptance Criteria:**
- [ ] All endpoints validate input using schema
- [ ] Invalid input returns 400 Bad Request
- [ ] SQL injection attempts blocked
- [ ] XSS attempts in text fields sanitized
- [ ] Valid input continues to work

**Testing Criteria:**
```bash
# Test 1: SQL injection attempt should fail safely
curl -X POST https://[site]/.netlify/functions/sync-ebay-listings \
     -H "Authorization: Bearer [token]" \
     -d '{"sku": "test; DROP TABLE listings;--"}'
# Expected: Input rejected OR safely escaped

# Test 2: Valid input should work
curl -X POST https://[site]/.netlify/functions/auto-list-single \
     -H "Authorization: Bearer [token]" \
     -d '{"asin": "B01KJEOCDW", "price": "29.99"}'
# Expected: Success

# Test 3: Invalid ASIN format rejected
curl -X POST https://[site]/.netlify/functions/auto-list-single \
     -H "Authorization: Bearer [token]" \
     -d '{"asin": "invalid!", "price": "29.99"}'
# Expected: 400 Bad Request
```

**Implementation:**
```javascript
// utils/validation.js
const Joi = require('joi');

const schemas = {
  asin: Joi.string().pattern(/^[A-Z0-9]{10}$/).required(),
  price: Joi.number().positive().max(99999).required(),
  sku: Joi.string().max(50).pattern(/^[a-zA-Z0-9_-]+$/)
};

function validate(data, schemaName) {
  const schema = schemas[schemaName];
  const { error, value } = schema.validate(data);
  if (error) {
    return { valid: false, error: error.message };
  }
  return { valid: true, value };
}
```

---

### STORY-SEC-009: Add Audit Logging
**Priority:** 🟡 Medium  
**Estimate:** 3 hours

**As a** system administrator  
**I want** security events logged  
**So that** I can detect and investigate suspicious activity

**Acceptance Criteria:**
- [ ] Log all authentication attempts (success/failure)
- [ ] Log all sensitive operations (price changes, listing creation)
- [ ] Log includes: timestamp, user_id, IP, action, result
- [ ] Logs stored in Supabase `audit_log` table
- [ ] No sensitive data (passwords, tokens) in logs

**Events to Log:**
- Login success/failure
- Token refresh
- Listing created/updated/deleted
- Price changed
- eBay sync triggered
- Settings changed

**Testing Criteria:**
```sql
-- After performing actions, verify logs exist:
SELECT * FROM audit_log 
WHERE user_id = '[user_id]' 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Epic: Data Protection

### STORY-SEC-010: Encrypt Sensitive Data at Rest
**Priority:** 🟡 Medium  
**Estimate:** 3 hours

**As a** user  
**I want** my API keys encrypted in the database  
**So that** they're protected even if database is compromised

**Current State:** ✅ Already implemented for Keepa keys

**Acceptance Criteria:**
- [ ] All API keys encrypted using AES-256
- [ ] Encryption key stored only in environment variables
- [ ] Decryption only happens in memory, never logged
- [ ] Key rotation procedure documented
- [ ] Existing encrypted data still readable

**Testing Criteria:**
```sql
-- Verify encrypted data is not readable
SELECT keepa_api_key_encrypted FROM user_settings WHERE user_id = '[id]';
-- Expected: Encrypted blob, not readable text

-- Verify decryption works in application
# Use app to make Keepa API call
# Expected: Success (key was decrypted correctly)
```

---

### STORY-SEC-011: Implement User Data Scoping
**Priority:** 🟠 High  
**Estimate:** 2 hours

**As a** user  
**I want** to only see my own data  
**So that** other users' data is never exposed to me

**Acceptance Criteria:**
- [ ] All database queries include `user_id` filter
- [ ] RLS policies enforced at database level
- [ ] API cannot return other users' data even with manipulation
- [ ] Admin functions (if any) require special role

**Testing Criteria:**
```bash
# Test 1: Try to access another user's listing (should fail)
curl -H "Authorization: Bearer [user_a_token]" \
     "https://[site]/.netlify/functions/get-listing?id=[user_b_listing_id]"
# Expected: 404 Not Found or 403 Forbidden

# Test 2: Listings query only returns own data
# Login as User A, verify only User A's listings shown
# Login as User B, verify only User B's listings shown
```

---

## Implementation Order

### Phase 1: Critical (Do First)
1. SEC-001: Protect admin endpoints ✅
2. SEC-002: Protect background job triggers
3. SEC-003: Remove test endpoints

### Phase 2: High Priority
4. SEC-004: Security headers
5. SEC-005: CORS restrictions
6. SEC-011: User data scoping verification

### Phase 3: Medium Priority
7. SEC-006: Rate limiting
8. SEC-007: Error sanitization
9. SEC-008: Input validation
10. SEC-009: Audit logging
11. SEC-010: Encryption verification

---

## Regression Testing Checklist

After implementing security changes, verify:

- [ ] **Login flow** - Can login with email/password
- [ ] **Listings page** - Loads and displays listings
- [ ] **Quick List** - Can create new eBay listing from ASIN
- [ ] **Sync** - eBay sync still works
- [ ] **Price reduction** - Scheduled reductions still work
- [ ] **Strategies** - Can create/edit strategies
- [ ] **Settings** - Can update eBay credentials
- [ ] **API Keys** - Can add/update Keepa key
- [ ] **ASIN Correlation** - Influencer lookup works
- [ ] **Mobile** - App works on mobile devices

---

## Security Testing Tools

```bash
# Run these after implementation:

# 1. Check for exposed endpoints
for f in admin sync trigger test; do
  echo "Testing: $f"
  curl -s -o /dev/null -w "%{http_code}" "https://[site]/.netlify/functions/$f"
done

# 2. Check security headers
curl -I https://[site]/.netlify/functions/health | grep -E "X-|Content-Security"

# 3. Check CORS
curl -H "Origin: https://evil.com" -I https://[site]/.netlify/functions/health

# 4. Run npm audit
cd netlify/functions && npm audit
cd frontend && npm audit
```
