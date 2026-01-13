# Non-Functional Requirements Gap Analysis

> **Document Version:** 1.0
> **Analysis Date:** 2026-01-12
> **Project:** eBay Price Reducer SaaS Application
> **Stack:** React + Supabase + Netlify Functions

---

## Executive Summary

This document identifies gaps in non-functional requirements across security, performance, reliability, scalability, testing, and monitoring. The analysis is based on a review of SECURITY.md, ARCHITECTURE.md, and the netlify/functions implementation.

**Overall Assessment:** The application has a solid security foundation but has critical gaps in:
- Test coverage (minimal unit/integration tests)
- Production monitoring & alerting (not integrated)
- Connection pooling and cold start optimization
- Multi-tenant data isolation validation
- Disaster recovery procedures

---

## 1. Security Gaps

### 1.1 Token Storage & Encryption

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SEC-001 | **Key Rotation Not Implemented** | 🔴 HIGH | `ENCRYPTION_KEY` is static; no rotation mechanism | Implement key rotation strategy with key versioning. Store key version with encrypted data. |
| SEC-002 | **Encryption Key Validation Weak** | 🟡 MEDIUM | Only checks length (64 hex chars) | Add entropy validation; ensure key is cryptographically random, not derived from weak sources |
| SEC-003 | **No Encrypted Backup Strategy** | 🔴 HIGH | Encrypted tokens not backed up separately | Implement encrypted backup for eBay tokens; consider HSM for production |
| SEC-004 | **Decryption Failures Silent** | 🟡 MEDIUM | `decrypt()` returns `null` on failure, logs generic error | Add specific error types; alert on repeated decryption failures (could indicate key compromise) |

**Code Reference:** `netlify/functions/utils/encryption.js`

```javascript
// Current: Only checks length
function isEncryptionConfigured() {
  return !!ENCRYPTION_KEY && ENCRYPTION_KEY.length === 64;
}

// Recommended: Add entropy check and format validation
function isEncryptionConfigured() {
  if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64) return false;
  // Validate hex format
  if (!/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) return false;
  // Could add entropy analysis
  return true;
}
```

### 1.2 API Key Handling

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SEC-005 | **Platform Credentials in Env Vars** | 🟡 MEDIUM | `EBAY_CLIENT_ID/SECRET` stored as env vars | Consider Netlify/Supabase vault for secrets in production |
| SEC-006 | **No API Key Scoping** | 🟡 MEDIUM | Service role key used for all operations | Create scoped Supabase service accounts per function type |
| SEC-007 | **Keepa API Key Exposure Risk** | 🟡 MEDIUM | API key passed to functions without rotation | Implement key rotation schedule; log API key usage patterns |

### 1.3 Authentication/Authorization

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SEC-008 | **No Token Revocation Mechanism** | 🔴 HIGH | eBay refresh tokens cannot be remotely revoked | Implement token blacklist; store token version in DB |
| SEC-009 | **JWT Validation Incomplete** | 🟡 MEDIUM | Basic Supabase auth check; no custom claims validation | Validate JWT claims (aud, iss, exp) explicitly |
| SEC-010 | **No Session Binding** | 🟡 MEDIUM | Tokens not bound to device/IP | Consider device fingerprinting for sensitive operations |
| SEC-011 | **Missing RBAC Implementation** | 🟢 LOW | Single user role assumed | Prepare for admin/user role separation as documented in future plans |

### 1.4 Multi-Tenant Data Isolation

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SEC-012 | **RLS Policy Testing Missing** | 🔴 HIGH | RLS documented but no automated tests | Add integration tests that verify cross-tenant isolation |
| SEC-013 | **Service Role Bypasses RLS** | 🔴 HIGH | `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS | Audit all service role usage; minimize to background jobs only |
| SEC-014 | **No Tenant Context Logging** | 🟡 MEDIUM | Logs don't consistently include user_id | Add user_id to all log contexts for audit trail |
| SEC-015 | **Bulk Operations Tenant Risk** | 🟡 MEDIUM | `bulkUpdatePriceQuantity` operates across items | Verify tenant ownership before bulk operations |

**Critical Code Pattern:**
```javascript
// Current: Service role used everywhere
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Recommended: Use user context when possible
const supabaseWithUser = createClient(supabaseUrl, supabaseAnonKey, {
  global: { headers: { Authorization: `Bearer ${userToken}` } }
});
```

### 1.5 OWASP Compliance

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SEC-016 | **A01:2021 Broken Access Control** | 🔴 HIGH | No automated access control testing | Add DAST tools; test for IDOR vulnerabilities |
| SEC-017 | **A03:2021 Injection** | 🟢 LOW | Parameterized queries used | Continue using Supabase ORM; add input validation tests |
| SEC-018 | **A04:2021 Insecure Design** | 🟡 MEDIUM | No threat modeling documented | Create threat model for eBay OAuth flow |
| SEC-019 | **A07:2021 Auth Failures** | 🟡 MEDIUM | Rate limiting exists but not logged centrally | Aggregate auth failures; implement account lockout alerts |
| SEC-020 | **A09:2021 Security Logging** | 🟡 MEDIUM | Logger exists but not integrated with SIEM | Integrate with Datadog/Sentry for security events |

---

## 2. Performance Gaps

### 2.1 API Response Times

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| PERF-001 | **No Response Time SLOs** | 🟡 MEDIUM | Target metrics in ARCHITECTURE.md but not enforced | Implement response time monitoring with alerts |
| PERF-002 | **eBay API Latency Untracked** | 🔴 HIGH | API calls not individually timed | Add timing to `ebayApiRequest()` with P95/P99 tracking |
| PERF-003 | **No Request Timeout Enforcement** | 🔴 HIGH | Functions can run until Netlify timeout (26s) | Add explicit timeouts per operation type |

**Recommended Implementation:**
```javascript
// Add to ebay-oauth.js
async function ebayApiRequest(accessToken, endpoint, options = {}) {
  const startTime = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 10000);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    const duration = Date.now() - startTime;
    logger.performance('ebay_api_call', duration, { endpoint });
    
    if (duration > 5000) {
      logger.warn('Slow eBay API call', { endpoint, duration });
    }
    
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```

### 2.2 Database Query Optimization

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| PERF-004 | **No Query Performance Monitoring** | 🟡 MEDIUM | No slow query logging | Enable Supabase query logging; add EXPLAIN analysis |
| PERF-005 | **Missing Composite Indexes** | 🟡 MEDIUM | Basic indexes mentioned in ARCHITECTURE.md | Audit queries and add compound indexes for common filters |
| PERF-006 | **No Query Result Caching** | 🟡 MEDIUM | No application-level caching | Implement TTL cache for repeated queries (user stats, categories) |
| PERF-007 | **Materialized Views Not Refreshed** | 🔴 HIGH | `user_listing_stats` view referenced but no refresh job | Add scheduled refresh for materialized views |

### 2.3 Rate Limiting Implementation

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| PERF-008 | **Rate Limits Not Enforced Server-Side** | 🔴 HIGH | Rate limiting documented but not implemented in functions | Add rate limiting middleware to Netlify Functions |
| PERF-009 | **eBay API Quota Not Tracked** | 🔴 HIGH | 5000 calls/day mentioned but not monitored | Implement quota tracking; alert at 80% usage |
| PERF-010 | **No Per-User Rate Limiting** | 🟡 MEDIUM | Same limits for all users | Implement tiered rate limits based on user plan |

**Implementation Gap - No rate limiting in functions:**
```javascript
// sync-ebay-listings.js has no rate limiting
// Should add:
const rateLimit = require('rate-limiter-flexible');
const rateLimiter = new rateLimit.RateLimiterMemory({
  points: 10,      // 10 requests
  duration: 60     // per minute
});

// In handler:
try {
  await rateLimiter.consume(userId);
} catch (rateLimitError) {
  return { statusCode: 429, body: JSON.stringify({ error: 'Too many requests' }) };
}
```

### 2.4 Caching Strategy

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| PERF-011 | **No Hot Cache Implementation** | 🟡 MEDIUM | Three-tier caching documented but not implemented | Implement Redis/memory cache for hot data |
| PERF-012 | **Cache-Control Headers Missing** | 🟡 MEDIUM | Only on health endpoint | Add Cache-Control to read-only API responses |
| PERF-013 | **No CDN Caching for API** | 🟢 LOW | Only static assets cached | Consider edge caching for category/settings APIs |
| PERF-014 | **No Cache Invalidation Strategy** | 🔴 HIGH | Cache mentioned but no invalidation logic | Implement cache invalidation on price updates |

---

## 3. Reliability Gaps

### 3.1 Error Handling Patterns

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| REL-001 | **Inconsistent Error Responses** | 🟡 MEDIUM | Mix of `{ error: msg }` and `{ message: msg }` | Standardize error response format |
| REL-002 | **No Error Classification** | 🟡 MEDIUM | All errors treated equally | Classify errors: transient, permanent, user-error |
| REL-003 | **Sensitive Info in Error Messages** | 🟡 MEDIUM | Some functions leak stack traces | Sanitize error messages in production |
| REL-004 | **Missing Error Boundaries** | 🟡 MEDIUM | Frontend errors crash the app | Add React Error Boundaries to all routes |

**Error Response Standard Recommendation:**
```javascript
// Standardized error response
function errorResponse(statusCode, code, message, details = null) {
  return {
    statusCode,
    body: JSON.stringify({
      success: false,
      error: {
        code,        // e.g., 'EBAY_TOKEN_EXPIRED'
        message,     // User-friendly message
        details: process.env.NODE_ENV === 'development' ? details : undefined,
        timestamp: new Date().toISOString()
      }
    })
  };
}
```

### 3.2 Retry Logic

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| REL-005 | **No Automatic Retry for eBay API** | 🔴 HIGH | Single attempt; failures not retried | Implement exponential backoff for 429/5xx errors |
| REL-006 | **Token Refresh No Retry** | 🔴 HIGH | `refreshAccessToken()` fails permanently on error | Add retry with fresh credentials on auth errors |
| REL-007 | **Database Operations No Retry** | 🟡 MEDIUM | Supabase calls fail on transient errors | Add retry for connection timeouts |
| REL-008 | **No Circuit Breaker Pattern** | 🔴 HIGH | Failed services continue to receive traffic | Implement circuit breaker for eBay API |

**Recommended Retry Implementation:**
```javascript
async function withRetry(fn, options = {}) {
  const { maxAttempts = 3, baseDelay = 1000, maxDelay = 30000 } = options;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = error.status === 429 || 
                         (error.status >= 500 && error.status < 600);
      
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 3.3 Graceful Degradation

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| REL-009 | **No Fallback for eBay API Outages** | 🔴 HIGH | App unusable if eBay API down | Show cached data; queue operations for later |
| REL-010 | **No Offline Mode** | 🟡 MEDIUM | Frontend requires connectivity | Implement service worker for read-only offline |
| REL-011 | **No Feature Flags** | 🟡 MEDIUM | All features always on | Add feature flags for gradual rollouts |
| REL-012 | **Missing Health Check Dependencies** | 🟡 MEDIUM | Health check doesn't test eBay API connectivity | Add eBay API health probe (with caching) |

### 3.4 Backup & Recovery

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| REL-013 | **No Documented Backup Strategy** | 🔴 HIGH | Supabase has backups but no recovery tested | Document and test recovery procedures |
| REL-014 | **No Point-in-Time Recovery Testing** | 🔴 HIGH | PITR not validated | Schedule quarterly recovery drills |
| REL-015 | **Token Recovery Not Documented** | 🔴 HIGH | If encryption key lost, all tokens lost | Document key recovery; consider escrow |
| REL-016 | **No Cross-Region Redundancy** | 🟡 MEDIUM | Single Supabase region | Evaluate multi-region for HA requirements |

---

## 4. Scalability Gaps

### 4.1 Multi-User Load Handling

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SCAL-001 | **No Load Testing Performed** | 🔴 HIGH | Benchmarks in ARCHITECTURE.md but not validated | Run load tests with k6/Artillery |
| SCAL-002 | **Single-Tenant Design Patterns** | 🟡 MEDIUM | Some functions don't filter by user_id efficiently | Add user_id to all query WHERE clauses first |
| SCAL-003 | **Scheduled Job Contention** | 🔴 HIGH | `sync-ebay-listings-scheduled` runs for all users | Implement per-user job queuing |
| SCAL-004 | **No Horizontal Scaling Strategy** | 🟡 MEDIUM | Relies on Netlify auto-scaling | Document scaling limits and thresholds |

### 4.2 Database Scaling

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SCAL-005 | **No Partition Strategy for Price History** | 🟡 MEDIUM | `price_history` could grow unbounded | Implement time-based partitioning |
| SCAL-006 | **No Data Archival Policy** | 🟡 MEDIUM | Old data never archived | Archive price history > 1 year to cold storage |
| SCAL-007 | **Index Analysis Missing** | 🟡 MEDIUM | Indexes documented but not analyzed | Run `pg_stat_user_indexes` analysis |
| SCAL-008 | **No Read Replica Usage** | 🟢 LOW | All queries hit primary | Consider read replica for analytics queries |

### 4.3 Function Cold Starts

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SCAL-009 | **Large Dependencies Increase Cold Start** | 🟡 MEDIUM | `@supabase/supabase-js`, `apollo-server-lambda` | Split functions; use lighter clients |
| SCAL-010 | **No Function Warming** | 🟡 MEDIUM | Cold starts can add 1-3s | Implement scheduled warming pings |
| SCAL-011 | **Heavy Initialization** | 🟡 MEDIUM | Supabase client created per request | Move to global scope for connection reuse |

**Cold Start Optimization:**
```javascript
// Current: Created per function invocation
exports.handler = async (event) => {
  const supabase = createClient(url, key); // Cold start cost
  ...
};

// Optimized: Global scope
const supabase = createClient(url, key);
exports.handler = async (event) => {
  // Reuses connection
  ...
};
```

### 4.4 Connection Pooling

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| SCAL-012 | **No Connection Pooling** | 🔴 HIGH | Each function opens new connection | Use Supabase connection pooler (pgBouncer) |
| SCAL-013 | **Connection Limits Unknown** | 🔴 HIGH | May hit Supabase connection limits under load | Monitor `pg_stat_activity`; configure pool size |
| SCAL-014 | **No Connection Timeout** | 🟡 MEDIUM | Connections may hang indefinitely | Add connection timeout to Supabase client |

---

## 5. Testing Gaps

### 5.1 Unit Test Coverage

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| TEST-001 | **Only 1 Test File Exists** | 🔴 HIGH | Only `api.test.js` in frontend | Target 80% coverage for critical paths |
| TEST-002 | **No Backend Unit Tests** | 🔴 HIGH | Zero tests for Netlify Functions | Add unit tests for all utils and core functions |
| TEST-003 | **Encryption Utils Not Tested** | 🔴 HIGH | `encryption.js` has no tests | Add tests for encrypt/decrypt edge cases |
| TEST-004 | **OAuth Flow Not Tested** | 🔴 HIGH | `ebay-oauth.js` untested | Mock eBay API responses; test token refresh |

**Minimum Test Coverage Required:**
```
├── netlify/functions/utils/
│   ├── encryption.test.js        ❌ MISSING
│   ├── ebay-oauth.test.js        ❌ MISSING
│   ├── logger.test.js            ❌ MISSING
│   └── supabase.test.js          ❌ MISSING
├── netlify/functions/
│   ├── sync-ebay-listings.test.js        ❌ MISSING
│   ├── process-price-reductions.test.js  ❌ MISSING
│   └── ebay-oauth-callback.test.js       ❌ MISSING
```

### 5.2 Integration Tests

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| TEST-005 | **No API Integration Tests** | 🔴 HIGH | Functions not tested end-to-end | Add integration tests with test database |
| TEST-006 | **No eBay API Mock Server** | 🔴 HIGH | Can't test without real eBay calls | Create mock server for eBay API responses |
| TEST-007 | **No Multi-Tenant Test Scenarios** | 🔴 HIGH | Can't verify data isolation | Add tests with multiple test users |
| TEST-008 | **No Auth Flow Integration Tests** | 🟡 MEDIUM | OAuth callback not tested | Test full OAuth flow with mocked eBay |

### 5.3 E2E Tests

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| TEST-009 | **No E2E Test Framework** | 🔴 HIGH | No Playwright/Cypress setup | Set up Playwright for critical user journeys |
| TEST-010 | **No Smoke Tests for Deploy** | 🔴 HIGH | No verification after deployment | Add smoke tests to CI/CD pipeline |
| TEST-011 | **No Visual Regression Tests** | 🟢 LOW | UI changes not caught | Consider Percy/Chromatic for visual testing |
| TEST-012 | **No Accessibility Tests** | 🟡 MEDIUM | No a11y validation | Add axe-core checks to E2E suite |

### 5.4 Test Data Management

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| TEST-013 | **No Test Data Fixtures** | 🔴 HIGH | Tests would need manual setup | Create fixtures for listings, users, tokens |
| TEST-014 | **No Test Database Seeding** | 🔴 HIGH | No automated test data creation | Implement database seeding scripts |
| TEST-015 | **No Data Cleanup Between Tests** | 🟡 MEDIUM | Tests could pollute each other | Add test isolation with transactions/cleanup |
| TEST-016 | **Production Data in Tests** | 🟡 MEDIUM | Risk of using real data | Ensure all tests use synthetic data only |

---

## 6. Monitoring & Observability Gaps

### 6.1 Logging Strategy

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| MON-001 | **Logger Not Used Consistently** | 🟡 MEDIUM | `logger.js` exists but most functions use `console.log` | Replace all console.log with logger calls |
| MON-002 | **No Request ID Correlation** | 🔴 HIGH | Can't trace requests across functions | Generate and propagate request IDs |
| MON-003 | **No Log Aggregation** | 🔴 HIGH | Logs only in Netlify dashboard | Integrate with Datadog/LogRocket/Axiom |
| MON-004 | **Sensitive Data in Logs** | 🟡 MEDIUM | Some functions may log tokens | Audit all log statements; redact sensitive fields |

**Log Correlation Implementation:**
```javascript
// Add to all function handlers
const requestId = event.headers['x-request-id'] || 
                 `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const log = logger.withContext({ requestId, userId: user?.id });
log.info('Request started', { path: event.path });
```

### 6.2 Error Tracking

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| MON-005 | **No Sentry/Rollbar Integration** | 🔴 HIGH | `sendToMonitoring()` is a stub | Integrate Sentry for error tracking |
| MON-006 | **No Error Grouping** | 🔴 HIGH | Can't see error patterns | Configure error fingerprinting in Sentry |
| MON-007 | **No User Context in Errors** | 🟡 MEDIUM | Errors don't include user info | Add user context to error reports |
| MON-008 | **No Source Maps** | 🟡 MEDIUM | Stack traces hard to read | Upload source maps to error tracking service |

**Sentry Integration (stub in logger.js needs implementation):**
```javascript
// Current stub:
sendToMonitoring(logEntry) {
  console.log('🚨 Critical error logged - would send to monitoring service');
}

// Recommended implementation:
const Sentry = require('@sentry/node');
Sentry.init({ dsn: process.env.SENTRY_DSN });

sendToMonitoring(logEntry) {
  Sentry.captureException(logEntry.error?.original || new Error(logEntry.message), {
    extra: logEntry,
    tags: { category: logEntry.category }
  });
}
```

### 6.3 Performance Monitoring

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| MON-009 | **No APM Integration** | 🔴 HIGH | No performance tracing | Integrate Datadog APM or New Relic |
| MON-010 | **No Database Query Metrics** | 🟡 MEDIUM | Query times not tracked | Enable Supabase query logging |
| MON-011 | **No Function Duration Metrics** | 🟡 MEDIUM | Only response time in health check | Track all function execution times |
| MON-012 | **No Real User Monitoring** | 🟡 MEDIUM | No frontend performance data | Add RUM for Core Web Vitals |

### 6.4 Alerting

| ID | Gap | Priority | Current State | Recommendation |
|----|-----|----------|---------------|----------------|
| MON-013 | **No Alerting System** | 🔴 HIGH | Alert thresholds documented but not implemented | Set up PagerDuty/Opsgenie integration |
| MON-014 | **No On-Call Rotation** | 🟡 MEDIUM | No incident response process | Define on-call schedule and escalation |
| MON-015 | **No Uptime Monitoring** | 🔴 HIGH | No external uptime checks | Add BetterUptime/Pingdom for health endpoint |
| MON-016 | **No eBay API Quota Alerts** | 🔴 HIGH | Could exhaust API quota silently | Alert at 80% daily quota usage |

---

## Priority Summary

### Critical (🔴 HIGH) - Address Immediately

| Area | Count | Key Items |
|------|-------|-----------|
| Security | 6 | Key rotation, token revocation, RLS testing, service role bypass |
| Performance | 4 | Rate limiting, eBay API tracking, materialized view refresh |
| Reliability | 6 | Retry logic, circuit breaker, backup testing |
| Scalability | 4 | Load testing, connection pooling, scheduled job contention |
| Testing | 9 | Unit tests, integration tests, E2E framework |
| Monitoring | 6 | Log aggregation, error tracking, alerting |

### Important (🟡 MEDIUM) - Plan for Next Sprint

| Area | Count |
|------|-------|
| Security | 10 |
| Performance | 6 |
| Reliability | 6 |
| Scalability | 6 |
| Testing | 4 |
| Monitoring | 6 |

### Nice-to-Have (🟢 LOW) - Future Enhancements

| Area | Count |
|------|-------|
| Security | 2 |
| Performance | 1 |
| Scalability | 1 |
| Testing | 1 |

---

## Recommended Implementation Roadmap

### Phase 1: Critical Security & Testing (Week 1-2)
1. Implement unit tests for encryption and OAuth utils
2. Add Sentry error tracking
3. Implement connection pooling
4. Add request ID correlation to logging
5. Document and test backup recovery

### Phase 2: Performance & Reliability (Week 3-4)
1. Implement retry logic with exponential backoff
2. Add rate limiting to functions
3. Set up log aggregation
4. Add circuit breaker for eBay API
5. Create E2E test framework

### Phase 3: Monitoring & Alerting (Week 5-6)
1. Integrate APM (Datadog/New Relic)
2. Set up alerting for critical metrics
3. Add uptime monitoring
4. Implement eBay API quota tracking
5. Create runbook for common incidents

### Phase 4: Scalability & Optimization (Week 7-8)
1. Run load testing
2. Optimize cold starts
3. Implement caching layer
4. Add database partitioning for price history
5. Create feature flag system

---

## Appendix: Test Files Needed

```bash
# Backend tests (create these files)
touch netlify/functions/__tests__/encryption.test.js
touch netlify/functions/__tests__/ebay-oauth.test.js
touch netlify/functions/__tests__/sync-ebay-listings.test.js
touch netlify/functions/__tests__/process-price-reductions.test.js
touch netlify/functions/__tests__/health.test.js

# Frontend tests (expand coverage)
touch frontend/src/pages/__tests__/Listings.test.jsx
touch frontend/src/pages/__tests__/ApiKeys.test.jsx
touch frontend/src/components/__tests__/PriceReductionToggle.test.jsx

# Integration tests
touch integration/__tests__/ebay-sync.integration.test.js
touch integration/__tests__/multi-tenant.integration.test.js

# E2E tests
touch e2e/login.spec.ts
touch e2e/listing-sync.spec.ts
touch e2e/price-reduction.spec.ts
```

---

## References

- [SECURITY.md](/Users/jcsdirect/clawd/projects/ebay-price-reducer/SECURITY.md)
- [ARCHITECTURE.md](/Users/jcsdirect/clawd/projects/ebay-price-reducer/ARCHITECTURE.md)
- [GO-LIVE-CHECKLIST.md](/Users/jcsdirect/clawd/projects/ebay-price-reducer/docs/GO-LIVE-CHECKLIST.md)
- [OWASP Top 10 2021](https://owasp.org/www-project-top-ten/)
- [Supabase Security Best Practices](https://supabase.com/docs/guides/platform/going-into-prod)
