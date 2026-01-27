# Demo Environment Setup Plan

## Overview
Create a dedicated demo environment in UAT with mock integrations and realistic test data for recording product demos.

---

## Part 1: Demo Account Setup

### Creating a Demo User

**Method: Supabase Auth + Database Insert**

OpSyncPro uses Supabase Auth for authentication. To create a demo user:

1. **Create auth user via Supabase Dashboard or API**
   - Email: `demo@opsyncpro.io`
   - Password: `DemoUser2026!` (will be stored securely)
   
2. **Insert user profile in `users` table**
   - Link to auth.users UUID
   - Set `is_admin: false` (demo should see normal user view)

3. **No email verification needed** (can be bypassed in Supabase settings or auto-confirmed)

### Credentials Storage

```json
// In ~/clawd/secrets/credentials.json
{
  "opsyncpro": {
    "demo": {
      "email": "demo@opsyncpro.io",
      "password": "[stored securely]",
      "userId": "[uuid after creation]"
    }
  }
}
```

---

## Part 2: Integration Mocking Strategy

| Integration | Real Sandbox? | Mock Strategy | What Breaks if Faked? |
|-------------|--------------|---------------|----------------------|
| **eBay** | ✅ Yes (sandbox available) | Use eBay Sandbox API | Real listings won't work |
| **Keepa** | ⚠️ Partial | Real API with test ASINs | Nothing - just uses API credits |
| **Instagram** | ❌ No | Mock database entries | Can't actually post |
| **YouTube** | ❌ No | Mock database entries | Can't actually post |
| **Facebook** | ❌ No | Mock database entries | Can't actually post |
| **TikTok** | ❌ No | Mock database entries | Can't actually post |

### eBay Integration (Real Sandbox)

eBay provides a sandbox environment:
- Sandbox URL: `https://api.sandbox.ebay.com`
- Get sandbox credentials from eBay Developer Program
- Demo account connects to sandbox (not production)

**Recommendation:** Use real eBay sandbox for authentic demo experience.

### Keepa Integration (Real API)

Keepa doesn't have a sandbox, but:
- Can use real API with demo ASINs
- API calls are identical to production
- Just costs a few tokens per lookup

**Recommendation:** Use real Keepa API with curated demo ASINs.

### Social Media Integrations (Mocked)

For Instagram/YouTube/Facebook/TikTok, we can fake "connected" status:

```sql
-- Insert fake social account connection
INSERT INTO social_accounts (
  user_id, 
  platform, 
  username, 
  account_id,
  access_token,  -- Fake encrypted token
  is_active,
  account_metadata
) VALUES (
  '[demo_user_id]',
  'instagram',
  'demo_influencer',
  'demo_ig_123456',
  'DEMO_FAKE_TOKEN_DO_NOT_USE',
  true,
  '{"followers": 25000, "profile_pic": "https://placeholder.com/avatar.jpg"}'
);
```

**What Works:**
- UI shows "Connected" status ✅
- Account appears in dropdowns ✅
- Posts can be "scheduled" ✅

**What Breaks:**
- Actual posting will fail ❌
- Token refresh will fail ❌

**Mitigation:** For demos, we show the scheduling flow but don't actually click "Post Now". Or we catch the error gracefully.

---

## Part 3: Demo Data Seed Plan

### Product CRM Data (30 products)

| Category | Count | Examples |
|----------|-------|----------|
| Electronics | 10 | Headphones, speakers, chargers |
| Home & Kitchen | 8 | Kitchen gadgets, organizers |
| Beauty | 6 | Skincare, makeup tools |
| Sports & Outdoors | 6 | Fitness gear, camping items |

**Data includes:**
- Real ASINs (for Keepa lookups to work)
- Product images from Amazon
- Various statuses: Initial Contact → Committed → Ready to List
- Multiple owners on some products
- Price, cost, profit data

### ASIN Catalog Data (100 ASINs)

| Status | Count |
|--------|-------|
| Imported | 30 |
| Processed | 50 |
| Reviewed | 20 |

**Processed items include:**
- 2-5 correlations each
- Mix of accepted/declined/pending correlations
- Match percentages 60-95%

### Correlation Data

For each processed ASIN:
- 2-5 similar products found
- Match scores, profit estimates
- Some pre-accepted, some pre-declined

### Price Strategies (3 strategies)

1. **Aggressive Price Drop**
   - 5% reduction every 3 days
   - Min price: 50% of original

2. **Gentle Markdown**
   - $2 reduction every 7 days
   - Min price: cost + 20%

3. **Clearance Mode**
   - 10% reduction every 2 days
   - Min price: cost

### Social Posts (10 posts)

| Status | Count | Platforms |
|--------|-------|-----------|
| Draft | 2 | - |
| Scheduled | 4 | IG, YT, FB mix |
| Posted | 4 | Shows history |

### Product Videos (15 videos)

- Mix of products with/without videos
- Various durations (30s - 2min)
- Thumbnails generated
- Some with social_ready_url set

---

## Part 4: Implementation Scripts

### Script 1: Create Demo User

```sql
-- create-demo-user.sql
-- Run with service role key

-- Step 1: Create auth user (done via Supabase Dashboard or API)
-- Email: demo@opsyncpro.io

-- Step 2: Insert user profile
INSERT INTO users (id, email, username, name, created_at)
SELECT 
  id,
  email,
  'demo_user',
  'Demo User',
  NOW()
FROM auth.users 
WHERE email = 'demo@opsyncpro.io'
ON CONFLICT (id) DO NOTHING;
```

### Script 2: Seed Demo Data

```sql
-- seed-demo-data.sql
-- Requires: DEMO_USER_ID variable

-- Variables
DO $$
DECLARE
  demo_user_id UUID := '[INSERT_DEMO_USER_ID]';
BEGIN

-- =========================================
-- PRODUCT CRM: Statuses
-- =========================================
-- (Uses existing seeded statuses)

-- =========================================
-- PRODUCT CRM: Sample Products
-- =========================================
INSERT INTO sourced_products (user_id, asin, title, category, buy_price, sell_price, status, decision, important_date, notes)
VALUES
  (demo_user_id, 'B09V3KXJPB', 'Sony WH-1000XM5 Wireless Headphones', 'Electronics', 278.00, 399.99, (SELECT id FROM crm_statuses WHERE name = 'Ready to List' AND user_id = demo_user_id LIMIT 1), 'sell', NOW() + INTERVAL '7 days', 'High margin item'),
  (demo_user_id, 'B0BSHF7WHW', 'Apple AirPods Pro 2nd Gen', 'Electronics', 189.00, 249.99, (SELECT id FROM crm_statuses WHERE name = 'Committed' AND user_id = demo_user_id LIMIT 1), 'sell', NULL, 'Waiting on supplier'),
  -- ... more products
;

-- =========================================
-- SOCIAL ACCOUNTS: Fake Connections
-- =========================================
INSERT INTO social_accounts (user_id, platform, username, account_id, access_token, is_active, account_metadata)
VALUES
  (demo_user_id, 'instagram', 'demo_influencer', 'demo_ig_12345', 'FAKE_TOKEN', true, '{"followers": 25000}'),
  (demo_user_id, 'youtube', 'Demo Channel', 'UC_demo_123', 'FAKE_TOKEN', true, '{"subscribers": 10000}'),
  (demo_user_id, 'facebook', 'Demo Page', 'demo_fb_page', 'FAKE_TOKEN', true, '{"likes": 5000}');

-- =========================================
-- CATALOG IMPORTS: Sample ASINs
-- =========================================
INSERT INTO catalog_imports (user_id, asin, title, status, created_at)
VALUES
  (demo_user_id, 'B0EXAMPLE01', 'Sample Product 1', 'imported', NOW() - INTERVAL '5 days'),
  (demo_user_id, 'B0EXAMPLE02', 'Sample Product 2', 'processed', NOW() - INTERVAL '3 days'),
  (demo_user_id, 'B0EXAMPLE03', 'Sample Product 3', 'reviewed', NOW() - INTERVAL '1 day')
  -- ... more
;

-- =========================================
-- ASIN CORRELATIONS: Sample Matches
-- =========================================
INSERT INTO asin_correlations (user_id, search_asin, similar_asin, match_score, decision)
VALUES
  (demo_user_id, 'B0EXAMPLE02', 'B0SIMILAR01', 0.89, 'accepted'),
  (demo_user_id, 'B0EXAMPLE02', 'B0SIMILAR02', 0.75, 'declined'),
  (demo_user_id, 'B0EXAMPLE02', 'B0SIMILAR03', 0.82, NULL)
  -- ... more
;

-- =========================================
-- PRICE STRATEGIES
-- =========================================
INSERT INTO pricing_strategies (user_id, name, reduction_type, reduction_amount, frequency_days, min_price_type, min_price_value, is_active)
VALUES
  (demo_user_id, 'Aggressive Price Drop', 'percentage', 5, 3, 'percentage', 50, true),
  (demo_user_id, 'Gentle Markdown', 'amount', 2, 7, 'cost_plus', 20, true),
  (demo_user_id, 'Clearance Mode', 'percentage', 10, 2, 'cost', 0, false);

END $$;
```

### Script 3: Reset Demo Environment

```sql
-- reset-demo-environment.sql
-- Clears all demo data and re-seeds

DO $$
DECLARE
  demo_user_id UUID := '[INSERT_DEMO_USER_ID]';
BEGIN

-- Clear existing demo data
DELETE FROM post_results WHERE post_id IN (SELECT id FROM social_posts WHERE user_id = demo_user_id);
DELETE FROM social_posts WHERE user_id = demo_user_id;
DELETE FROM social_accounts WHERE user_id = demo_user_id;
DELETE FROM asin_correlations WHERE user_id = demo_user_id;
DELETE FROM catalog_imports WHERE user_id = demo_user_id;
DELETE FROM sourced_products WHERE user_id = demo_user_id;
DELETE FROM pricing_strategies WHERE user_id = demo_user_id;
DELETE FROM product_videos WHERE user_id = demo_user_id;

-- Re-run seed script
-- (Include seed statements here or call external file)

END $$;
```

---

## Part 5: Execution Checklist

### Phase 1: Account Creation
- [ ] Create demo@opsyncpro.io in Supabase Auth
- [ ] Insert user profile in users table
- [ ] Store credentials in credentials.json
- [ ] Verify login works on UAT

### Phase 2: Integration Setup
- [ ] Insert fake social_accounts entries
- [ ] Verify integrations page shows "Connected"
- [ ] (Optional) Set up eBay sandbox connection

### Phase 3: Data Seeding
- [ ] Run Product CRM seed (30 products)
- [ ] Run ASIN Catalog seed (100 ASINs)
- [ ] Run Correlations seed
- [ ] Run Price Strategies seed (3 strategies)
- [ ] Run Social Posts seed (10 posts)
- [ ] Verify data appears in UI

### Phase 4: Verification
- [ ] Screenshot each feature with demo data
- [ ] Verify all features work (except actual posting)
- [ ] Document any features that break with fake data

### Phase 5: Reset Testing
- [ ] Run reset script
- [ ] Verify clean slate
- [ ] Re-run seed script
- [ ] Verify data restored

---

## Questions for Pete

1. **Real product data?** 
   - Should demo products use real ASINs (so Keepa works)?
   - Or obviously fake data (B0DEMO001)?

2. **Demo persona?**
   - Electronics reseller?
   - Amazon influencer?
   - General arbitrage seller?

3. **eBay sandbox?**
   - Worth setting up for realistic eBay Central demos?
   - Or skip since it's extra complexity?

4. **Video files?**
   - Need actual video files for demo?
   - Or just database entries sufficient?

---

## Next Steps

1. **Get Pete's answers** on questions above
2. **Create Supabase auth user** for demo@opsyncpro.io
3. **Build full seed scripts** with real/realistic data
4. **Execute in UAT**
5. **Verify and screenshot**

---

*Plan created: 2026-01-27*
*Status: Awaiting approval*
