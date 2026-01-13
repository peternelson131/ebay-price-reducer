# UAT Environment Plan

> Enable complete end-to-end testing for eBay Price Reducer

## Current Limitation

Testing is limited to UI-only because:
- No eBay sandbox account connected
- Production database = can't test destructively
- Can't verify actual listing creation/updates

## Proposed UAT Setup

### 1. Separate Netlify Site (UAT)
```
Production: dainty-horse-49c336.netlify.app
UAT:        ebay-price-reducer-uat.netlify.app (new)
```

**Setup:**
- Fork or branch deployment
- Separate environment variables
- Point to UAT Supabase

### 2. Separate Supabase Project (UAT)
```
Production: zxcdkanccbdeqebnabgg.supabase.co
UAT:        [new-project].supabase.co
```

**Benefits:**
- Can test destructive operations
- Reset data between test runs
- No risk to production data

### 3. eBay Sandbox Credentials

eBay provides a sandbox environment:
- `api.sandbox.ebay.com` instead of `api.ebay.com`
- Separate OAuth flow
- Test listings don't affect real account

**Required:**
- Sandbox App credentials (separate from production)
- Sandbox user account for testing
- Connected to UAT environment

### 4. Keepa Test Mode

Options:
- Use real Keepa API with test ASINs
- Mock Keepa responses for specific test cases
- Dedicated test token with limited usage

## Test Account Matrix

| Account | Environment | Purpose |
|---------|-------------|---------|
| Pete | Production | Real usage |
| clawd@test.com | Production | UI testing (no API) |
| uat-tester@test.com | UAT | Full E2E testing |
| sandbox-seller | eBay Sandbox | Listing operations |

## What This Enables

### Full E2E Test Flows
1. ✅ Create listing from ASIN → actually posts to eBay sandbox
2. ✅ Import listings → pulls from sandbox account
3. ✅ Price reduction → updates sandbox listings
4. ✅ Strategy execution → verifies automation works

### Destructive Testing
- Delete all listings
- Reset database
- Stress test rate limits
- Test error recovery

### Automated Testing
- CI/CD can run E2E tests
- Playwright/Cypress against UAT
- Regression testing on every deploy

## Implementation Steps

### Phase 1: Supabase UAT (1 hour)
1. Create new Supabase project "ebay-price-reducer-uat"
2. Run schema migrations
3. Create UAT test users

### Phase 2: Netlify UAT (30 min)
1. Create new Netlify site from same repo
2. Set UAT env vars (Supabase UAT, eBay Sandbox)
3. Deploy

### Phase 3: eBay Sandbox (1 hour)
1. Create sandbox app in eBay Developer Portal
2. Generate sandbox OAuth credentials
3. Create sandbox test seller account
4. Connect to UAT environment

### Phase 4: Test Suite (ongoing)
1. Document test scenarios
2. Create automated tests
3. Run before each production deploy

## Cost

| Resource | Cost |
|----------|------|
| Supabase UAT | Free tier sufficient |
| Netlify UAT | Free tier sufficient |
| eBay Sandbox | Free |
| Total | **$0/month** |

---

## Next Steps

1. [ ] Pete provides eBay sandbox app credentials
2. [ ] Create Supabase UAT project
3. [ ] Deploy Netlify UAT site
4. [ ] Connect eBay sandbox
5. [ ] Document test scenarios
6. [ ] Run comprehensive E2E tests

---

*This enables the quality-focused approach: invest in proper testing infrastructure to build reliable systems.*
