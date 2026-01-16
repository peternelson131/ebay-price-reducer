# Security Audit Report - eBay Price Reducer
**Date:** January 15, 2026  
**Auditor:** Clawd (Automated Security Review)  
**Scope:** Frontend (React) + Backend (Netlify Functions) + Database (Supabase)

---

## Executive Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 2 | Needs Immediate Action |
| 🟠 High | 5 | Should Fix Before Production Scale |
| 🟡 Medium | 6 | Should Address |
| 🔵 Low | 4 | Best Practice Improvements |

---

## 🔴 CRITICAL ISSUES

### SEC-001: Exposed API Keys in Local Environment File
**Risk:** Complete account compromise, financial loss, data breach  
**Location:** `.env.local` file on local machine

**Exposed Secrets Found:**
- `ANTHROPIC_API_KEY` - sk-ant-api03-... (Claude API - can be used to rack up charges)
- `KEEPA_API_KEY` - Full Keepa API key exposed
- `SUPABASE_SERVICE_ROLE_KEY` - Bypasses ALL Row Level Security
- `JWT_SECRET` - Can forge authentication tokens
- `ENCRYPTION_KEY` - Can decrypt all stored credentials

**Status:** `.env.local` is in `.gitignore` but exists locally with real production secrets

**Remediation:**
1. **IMMEDIATELY** rotate ALL exposed keys:
   - Regenerate Anthropic API key
   - Regenerate Keepa API key  
   - Regenerate Supabase service role key
   - Generate new JWT secret
   - Generate new encryption key
2. Re-encrypt all stored credentials with new encryption key
3. Use a secrets manager (e.g., Netlify environment variables only, never local files)
4. Add pre-commit hooks to prevent secret commits

---

### SEC-002: Unauthenticated Endpoints Exposed
**Risk:** Unauthorized access to data and functionality  
**Location:** Multiple Netlify Functions

**Endpoints with NO authentication:**
| Endpoint | Risk |
|----------|------|
| `admin-get-locations.js` | Leaks merchant location data |
| `detect-aspect-gaps.js` | Database enumeration |
| `trigger-asin-correlation-background.js` | Can trigger expensive API calls |
| `trigger-price-reduction.js` | Can modify listing prices |
| `scheduled-price-reduction.js` | Price manipulation |
| `sync-ebay-listings-scheduled.js` | Unauthorized sync triggers |

**Test Functions (should be removed from production):**
- `test-category-functions.js`
- `test-quick-list-create.js`
- `test-quick-list-settings.js`
- `test-regression.js`
- `test-story-5.js`
- `test-story-6.js`

**Remediation:**
1. Add JWT/Bearer token validation to ALL endpoints
2. Remove or disable test endpoints in production
3. Implement webhook secrets for scheduled/background jobs
4. Add IP allowlisting for admin endpoints

---

## 🟠 HIGH SEVERITY ISSUES

### SEC-003: CORS Wildcard Configuration
**Risk:** Cross-site request forgery, data theft  
**Location:** `netlify/functions-dev/*.js`

**Finding:** Multiple endpoints use `Access-Control-Allow-Origin: '*'`

```javascript
// INSECURE:
'Access-Control-Allow-Origin': '*'
```

**Remediation:**
```javascript
// SECURE:
'Access-Control-Allow-Origin': 'https://your-app.netlify.app'
```

---

### SEC-004: No Rate Limiting
**Risk:** API abuse, denial of service, cost explosion  
**Location:** All Netlify Functions

**Finding:** Zero rate limiting implementation. An attacker could:
- Exhaust eBay API quota (2M calls/day)
- Exhaust Keepa API tokens (expensive)
- Cause denial of service
- Run up cloud costs

**Remediation:**
1. Implement per-user rate limiting using Supabase or Redis
2. Add per-IP rate limiting at Netlify level
3. Monitor and alert on unusual API usage patterns

---

### SEC-005: Service Role Key Used in Backend
**Risk:** Complete bypass of Row Level Security  
**Location:** Multiple Netlify Functions using `SUPABASE_SERVICE_ROLE_KEY`

**Finding:** Backend uses service role key which bypasses ALL RLS policies. If any function is compromised, attacker can access ALL users' data.

**Remediation:**
1. Use user's JWT token to make authenticated Supabase calls
2. Only use service role for specific admin operations with extra validation
3. Implement function-level authorization checks

---

### SEC-006: Potential SQL Injection via String Interpolation
**Risk:** Data breach, data manipulation  
**Location:** `activate-new-listings.js`

```javascript
// POTENTIALLY VULNERABLE:
query = query.or(`ebay_sku.ilike.${skuPattern},sku.ilike.${skuPattern}`);
```

**Remediation:** Use parameterized queries or validate/sanitize `skuPattern` input.

---

### SEC-007: Sensitive Data in Error Messages
**Risk:** Information disclosure  
**Location:** Various error responses

**Finding:** Some error messages may leak internal structure:
- "Keepa API key not configured"
- "Failed to decrypt Keepa API key"
- Stack traces in development mode

**Remediation:** Use generic error messages for clients, log detailed errors server-side only.

---

## 🟡 MEDIUM SEVERITY ISSUES

### SEC-008: No Input Validation Framework
**Risk:** Various injection attacks  
**Finding:** Input validation is ad-hoc with `parseInt`/`parseFloat` but no comprehensive schema validation.

**Remediation:** Use Zod or Joi for input validation on all endpoints.

---

### SEC-009: JWT Secret Strength Unknown
**Risk:** Token forgery if secret is weak  
**Location:** `JWT_SECRET` in environment

**Remediation:** Ensure JWT secret is at least 256 bits of cryptographic randomness.

---

### SEC-010: No HTTPS Enforcement Check
**Risk:** Man-in-the-middle attacks  
**Finding:** No explicit HSTS headers or HTTPS redirect logic in functions.

**Remediation:** Add HSTS headers, rely on Netlify's automatic HTTPS.

---

### SEC-011: Missing Security Headers
**Risk:** XSS, clickjacking  
**Finding:** No Content-Security-Policy, X-Frame-Options, or X-Content-Type-Options headers.

**Remediation:** Add security headers to all responses:
```javascript
headers: {
  'Content-Security-Policy': "default-src 'self'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

---

### SEC-012: Database Query Without User Scope
**Risk:** Data leakage across users  
**Location:** `detect-aspect-gaps.js`

**Finding:** Queries database without filtering by user_id.

---

### SEC-013: OAuth State Validation
**Risk:** CSRF in OAuth flow  
**Finding:** OAuth flow uses state parameter but verify thorough validation occurs.

---

## 🔵 LOW SEVERITY ISSUES

### SEC-014: Test Files in Production
**Risk:** Information disclosure, attack surface  
**Finding:** Multiple test-*.js files deployed to production.

**Remediation:** Exclude test files from production deployment.

---

### SEC-015: No Audit Logging
**Risk:** Inability to detect/investigate breaches  
**Finding:** No systematic logging of security events (logins, permission changes, data access).

**Remediation:** Implement audit logging for sensitive operations.

---

### SEC-016: Dependency Vulnerabilities
**Risk:** Known vulnerabilities in dependencies  
**Finding:** Not checked in this audit.

**Remediation:** Run `npm audit` regularly, use Dependabot/Snyk.

---

### SEC-017: No Session Timeout
**Risk:** Session hijacking  
**Finding:** Sessions may persist indefinitely.

**Remediation:** Implement session expiration and refresh token rotation.

---

## ✅ POSITIVE FINDINGS

1. **Row Level Security (RLS) enabled** on all main tables
2. **No XSS via dangerouslySetInnerHTML** - none found in codebase
3. **PKCE implemented** for OAuth flow
4. **Credentials encrypted** at rest using AES
5. **.env files properly gitignored** (not committed to repo)
6. **Supabase Auth** used for authentication (industry standard)
7. **No hardcoded secrets** in frontend code

---

## Priority Action Items

### Immediate (This Week)
1. [ ] **ROTATE ALL SECRETS** exposed in .env.local
2. [ ] Add authentication to unprotected endpoints
3. [ ] Remove test endpoints from production
4. [ ] Add CORS restrictions

### Short-term (This Month)
5. [ ] Implement rate limiting
6. [ ] Add security headers
7. [ ] Add input validation framework
8. [ ] Fix SQL injection vector

### Medium-term (This Quarter)
9. [ ] Implement audit logging
10. [ ] Add session management
11. [ ] Security penetration test
12. [ ] Dependency vulnerability scanning

---

*This audit is an automated review. A manual penetration test is recommended for production deployment.*
