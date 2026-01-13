# eBay Price Reducer - Functional Requirements Gap Analysis

> **Purpose:** Identify gaps between implemented backend functions and required functionality  
> **Date:** January 2026  
> **Analyst:** Functional Requirements Agent  
> **Scope:** Netlify Functions, Database Schema, API Integrations, Background Processing

---

## Executive Summary

This analysis identifies **45 functional gaps** across the backend implementation of the eBay Price Reducer SaaS application. The analysis focuses on API integration completeness, database design, background processing, and data management.

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Listing Import & Sync | 3 | 4 | 2 | 1 | 10 |
| Listing Creation (ASIN→eBay) | 2 | 3 | 3 | 1 | 9 |
| Price Management | 2 | 4 | 2 | 1 | 9 |
| API Integration Gaps | 2 | 3 | 3 | 1 | 9 |
| Background Processing | 1 | 2 | 2 | 1 | 6 |
| Data Management | 0 | 1 | 1 | 0 | 2 |
| **Total** | **10** | **17** | **13** | **5** | **45** |

---

## Current Implementation Status

### Implemented Functions (netlify/functions/)

| Function | Status | Description |
|----------|--------|-------------|
| `ebay-oauth-start.js` | ✅ Complete | OAuth initiation with PKCE |
| `ebay-oauth-callback.js` | ✅ Complete | Token exchange and storage |
| `ebay-connection-status.js` | ✅ Complete | Check eBay connection state |
| `ebay-disconnect.js` | ✅ Complete | Remove eBay tokens |
| `sync-ebay-listings.js` | ✅ Complete | Combined sync orchestrator |
| `sync-trading-api-listings.js` | ✅ Complete | XML Trading API import |
| `sync-inventory-api-listings.js` | ✅ Complete | REST Inventory API import |
| `auto-list-single.js` | ✅ Complete | ASIN→eBay listing creation |
| `auto-list.js` | ⚠️ Partial | Batch listing (limited) |
| `create-ebay-inventory-item.js` | ✅ Complete | Inventory item creation |
| `create-ebay-offer.js` | ✅ Complete | Offer creation |
| `publish-ebay-offer.js` | ✅ Complete | Offer publishing |
| `delete-ebay-inventory-item.js` | ✅ Complete | Item deletion |
| `delete-ebay-offer.js` | ✅ Complete | Offer deletion |
| `process-price-reductions.js` | ✅ Complete | Price reduction engine |
| `update-price-trading-api.js` | ✅ Complete | Trading API price updates |
| `activate-new-listings.js` | ✅ Complete | Auto-enable reductions |
| `deactivate-ended-listings.js` | ✅ Complete | Mark ended listings |
| `keepa-fetch-product.js` | ✅ Complete | Keepa product lookup |
| `keepa-api.js` | ✅ Complete | Keepa API wrapper |
| `generate-ebay-listing-content.js` | ✅ Complete | AI title/description |
| `get-ebay-category-suggestion.js` | ✅ Complete | Category mapping |
| `get-ebay-category-aspects.js` | ✅ Complete | Required aspects lookup |
| `validate-asin.js` | ✅ Complete | ASIN validation |
| `ebay-settings.js` | ✅ Complete | User settings CRUD |
| `analytics.js` | ⚠️ Partial | Basic analytics |
| `graphql-api.js` | ⚠️ Partial | GraphQL endpoint |
| `health.js` | ✅ Complete | Health check |
| `notification-service.js` | ⚠️ Stub | Notification placeholder |

---

## Part 1: Listing Import & Sync Gaps

### F-IMP001: Bulk Import API Rate Handling
**Priority:** 🔴 Critical  
**Current State:** `sync-trading-api-listings.js` and `sync-inventory-api-listings.js` implement basic pagination  
**Gap:** No exponential backoff, no rate limit header monitoring, no queue-based processing for large inventories

**Impact:** Users with 1,000+ listings may experience timeouts or partial imports

**Requirements:**
- [ ] Monitor `X-EBAY-API-CALL-LIMIT` and `X-EBAY-API-CALL-USAGE` headers
- [ ] Implement exponential backoff (1s → 2s → 4s → 8s)
- [ ] Queue-based import for inventories > 500 items
- [ ] Progress tracking visible to user (import 234 of 1,200)
- [ ] Resume capability for interrupted imports

**Effort:** 3-4 days

---

### F-IMP002: Incremental Sync (Delta Updates)
**Priority:** 🔴 Critical  
**Current State:** Full sync every time (`getInventoryItems` with pagination)  
**Gap:** No mechanism to sync only changed items

**Impact:** Wastes API calls, slow for large inventories, unnecessary database writes

**n8n Workflow Reference:** Uses `last_synced` timestamp to filter

**Requirements:**
- [ ] Store `last_full_sync` and `last_delta_sync` timestamps per user
- [ ] Use eBay notification API for real-time updates (see F-API003)
- [ ] Implement `getChangedInventoryItems` logic with date filter
- [ ] Trading API: Use `ModTimeFrom/ModTimeTo` in GetMyeBaySelling
- [ ] Inventory API: Compare checksums to detect changes

**Current Schema Gap:**
```sql
-- Missing columns in user_profiles
last_full_sync TIMESTAMPTZ,
last_delta_sync TIMESTAMPTZ,
sync_mode TEXT DEFAULT 'full' CHECK (sync_mode IN ('full', 'incremental', 'realtime'))
```

**Effort:** 4-5 days

---

### F-IMP003: Ended Listing Detection & Cleanup
**Priority:** 🔴 High  
**Current State:** `deactivate-ended-listings.js` exists but limited  
**Gap:** No reconciliation with eBay's actual ended items

**Impact:** Database has stale "Active" listings that are actually ended on eBay

**Requirements:**
- [ ] Cross-reference local listings with eBay active listings
- [ ] Call `GetMyeBaySelling` with `EndedList` to get recently ended items
- [ ] Set `listing_status = 'Ended'` and `ended_at` timestamp
- [ ] Update `quantity_available = 0` for ended listings
- [ ] Handle "sold" vs "ended without sale" distinction

**Current Schema Gap:**
```sql
-- Missing columns in listings
ended_at TIMESTAMPTZ,
ended_reason TEXT, -- 'sold', 'out_of_stock', 'manual', 'policy_violation'
sold_price DECIMAL(10,2),
sold_at TIMESTAMPTZ
```

**Effort:** 2-3 days

---

### F-IMP004: Trading API vs Inventory API Source Tracking
**Priority:** 🔴 High  
**Current State:** `source` column exists but not consistently used  
**Gap:** Listings created via different APIs have different update requirements

**Impact:** Price update fails if wrong API is used

**Requirements:**
- [ ] Always set `source = 'trading_api'` or `source = 'inventory_api'` on import
- [ ] Add `source` column validation constraint
- [ ] Route price updates based on source (already partially implemented in `process-price-reductions.js`)
- [ ] Handle listings that exist in both systems

**Schema Fix Needed:**
```sql
ALTER TABLE listings
ADD CONSTRAINT check_source CHECK (source IN ('trading_api', 'inventory_api', 'manual'));
```

**Effort:** 1 day

---

### F-IMP005: Inventory API Offer ID Tracking
**Priority:** 🔴 High  
**Current State:** `offer_id` column exists but not always populated  
**Gap:** Cannot update price without `offerId` for Inventory API listings

**Impact:** `bulkUpdatePriceQuantity` fails without offer IDs

**Requirements:**
- [ ] During Inventory API sync, fetch offers for each SKU
- [ ] Store `offer_id` in listings table
- [ ] Handle multiple offers per SKU (multiple marketplaces)
- [ ] Validate offer_id exists before price update

**API Call Needed:**
```javascript
GET /sell/inventory/v1/offer?sku={sku}
// Returns offers[].offerId
```

**Effort:** 2 days

---

### F-IMP006: Image URL Synchronization
**Priority:** 🟡 Medium  
**Current State:** `primary_image_url` stored, `image_urls` JSONB exists  
**Gap:** Full gallery not always synced, Amazon URLs may be blocked

**Requirements:**
- [ ] Fetch all eBay image URLs during sync
- [ ] Store in `image_urls` array (up to 12 images)
- [ ] Detect blocked/broken image URLs
- [ ] Flag for re-upload needed if images missing

**Effort:** 1-2 days

---

### F-IMP007: Listing Metadata Sync (Views, Watchers)
**Priority:** 🟡 Medium  
**Current State:** `watch_count`, `hit_count` in schema but not populated  
**Gap:** Analytics features require this data

**Requirements:**
- [ ] Fetch `WatchCount` and `HitCount` from Trading API
- [ ] Store in listings table
- [ ] Track trends over time (new table: `listing_metrics_history`)

**New Table Required:**
```sql
CREATE TABLE listing_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  watch_count INT,
  view_count INT,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effort:** 2 days

---

### F-IMP008: Category Tree Sync
**Priority:** 🟢 Low  
**Current State:** Category stored as text, no category hierarchy  
**Gap:** Cannot support category-based filtering or bulk strategy assignment

**Requirements:**
- [ ] Store category hierarchy from eBay Taxonomy API
- [ ] Create `ebay_categories` reference table
- [ ] Link listings to category tree for rollup queries

**Effort:** 3-4 days

---

### F-IMP009: Variation/Multi-SKU Listing Support
**Priority:** 🟡 Medium  
**Current State:** Single-variation listings only  
**Gap:** Sellers with color/size variations cannot import properly

**Impact:** Multi-variation listings appear as single item or fail to import

**Requirements:**
- [ ] Detect multi-variation listings in import
- [ ] Store parent-child relationship
- [ ] Handle variation-specific pricing
- [ ] Sync quantity per variation

**Schema Changes:**
```sql
ALTER TABLE listings
ADD COLUMN parent_listing_id UUID REFERENCES listings(id),
ADD COLUMN variation_attributes JSONB;
```

**Effort:** 4-5 days

---

### F-IMP010: Import Error Logging & Retry Queue
**Priority:** 🔴 High  
**Current State:** Errors logged to console, not persisted  
**Gap:** Failed imports are lost, no retry mechanism

**Requirements:**
- [ ] Create `import_errors` table for persistent error logging
- [ ] Queue failed items for retry (max 3 attempts)
- [ ] Surface import errors in UI
- [ ] Admin view of import health

**New Table:**
```sql
CREATE TABLE import_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ebay_item_id VARCHAR(100),
  sku VARCHAR(100),
  error_message TEXT,
  error_code VARCHAR(50),
  retry_count INT DEFAULT 0,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_retry_at TIMESTAMPTZ
);
```

**Effort:** 2-3 days

---

## Part 2: Listing Creation (ASIN→eBay) Gaps

### F-CRE001: Batch ASIN Processing
**Priority:** 🔴 Critical  
**Current State:** `auto-list-single.js` handles one ASIN at a time  
**Gap:** No batch creation for multiple ASINs

**User Need:** "I have 50 ASINs to list, I want to paste them and set a default price"

**Requirements:**
- [ ] Accept array of ASINs in request
- [ ] Parallel Keepa lookups (respect rate limits)
- [ ] Queue-based processing for large batches
- [ ] Return batch job ID for status polling
- [ ] Summary report: X succeeded, Y failed, Z skipped

**API Design:**
```javascript
POST /auto-list-batch
{
  "asins": ["B01ABC123", "B02DEF456", ...],
  "defaultPrice": 29.99,
  "priceMultiplier": 1.2, // Optional: Amazon price × 1.2
  "defaultQuantity": 1,
  "defaultCondition": "NEW",
  "autoActivateReduction": true,
  "strategyId": "uuid"
}

// Response
{
  "batchId": "uuid",
  "submitted": 50,
  "status": "processing"
}
```

**Effort:** 4-5 days

---

### F-CRE002: Required Aspects Population
**Priority:** 🔴 Critical  
**Current State:** `get-ebay-category-aspects.js` fetches aspects, but not all are populated  
**Gap:** Listings may fail to publish due to missing required aspects

**From Lessons Learned:**
> "Offers API returns validation errors if required aspects not provided"

**Requirements:**
- [ ] Map Keepa product attributes to eBay aspects
- [ ] Infer missing aspects from title/description via AI
- [ ] Show user which aspects are missing before publish
- [ ] Allow manual aspect entry in UI
- [ ] Block publish if required aspects missing

**Aspect Mapping Table:**
| Keepa Field | eBay Aspect |
|-------------|-------------|
| `manufacturer` | Brand |
| `model` | Model |
| `partNumber` | MPN |
| `upcList[0]` | UPC |
| - | Type (category-specific) |
| `color` | Color |

**Effort:** 3-4 days

---

### F-CRE003: Business Policy Validation
**Priority:** 🔴 High  
**Current State:** Hardcoded policy IDs in `auto-list-single.js`  
**Gap:** New users without configured policies will fail to create offers

**Current Hardcoded Values:**
```javascript
const DEFAULT_POLICIES = {
  fulfillmentPolicyId: '107540197026',
  paymentPolicyId: '243561626026',
  returnPolicyId: '243561625026'
};
```

**Requirements:**
- [ ] Fetch user's policies on eBay OAuth connect
- [ ] Store in `user_settings` table (encrypted)
- [ ] Validate policies exist before offer creation
- [ ] Guide user to create policies if missing
- [ ] Support policy selection in Quick List UI

**API Call:**
```javascript
GET /sell/account/v1/fulfillment_policy
GET /sell/account/v1/payment_policy  
GET /sell/account/v1/return_policy
```

**New Columns:**
```sql
ALTER TABLE user_profiles
ADD COLUMN ebay_fulfillment_policy_id VARCHAR(50),
ADD COLUMN ebay_payment_policy_id VARCHAR(50),
ADD COLUMN ebay_return_policy_id VARCHAR(50),
ADD COLUMN ebay_policies_fetched_at TIMESTAMPTZ;
```

**Effort:** 2-3 days

---

### F-CRE004: Merchant Location Management
**Priority:** 🔴 High  
**Current State:** Hardcoded location key  
**Gap:** Offer creation fails without valid merchant location

**From Lessons Learned:**
> "Publish failed with 'No Item.Country exists' - merchantLocationKey required"

**Requirements:**
- [ ] Fetch merchant locations on OAuth
- [ ] Store default location in user settings
- [ ] Create location if none exists
- [ ] Allow location selection in Quick List (for multi-location sellers)

**API Call:**
```javascript
GET /sell/inventory/v1/location
POST /sell/inventory/v1/location/{merchantLocationKey}
```

**Effort:** 1-2 days

---

### F-CRE005: Condition Mapping (Amazon→eBay)
**Priority:** 🟡 High  
**Current State:** Static condition enum in UI  
**Gap:** No validation of condition/category compatibility

**Category-Specific Conditions:**
| Category | Allowed |
|----------|---------|
| Video Games | NEW, LIKE_NEW, VERY_GOOD, GOOD, ACCEPTABLE |
| Electronics | NEW, MANUFACTURER_REFURBISHED, SELLER_REFURBISHED, USED_EXCELLENT |
| Collectibles | NEW, USED |

**Requirements:**
- [ ] Lookup valid conditions for selected category
- [ ] Map Amazon FBA condition to eBay condition
- [ ] Reject invalid condition/category combinations
- [ ] Default to "NEW" if not specified

**Effort:** 2 days

---

### F-CRE006: Image Re-hosting
**Priority:** 🟡 Medium  
**Current State:** Uses Amazon/Keepa image URLs directly  
**Gap:** eBay may block Amazon-sourced images

**Requirements:**
- [ ] Download images from Keepa URLs
- [ ] Upload to Supabase Storage or eBay's image server
- [ ] Store re-hosted URLs in listings table
- [ ] Handle image upload failures gracefully
- [ ] Support multiple images (eBay allows 12)

**API Call:**
```javascript
POST https://api.ebay.com/ws/api.dll
// UploadSiteHostedPictures (Trading API)
```

**Effort:** 3-4 days

---

### F-CRE007: Price Calculation with Fees
**Priority:** 🟡 Medium  
**Current State:** User enters price manually  
**Gap:** No visibility into profit margin after fees

**Requirements:**
- [ ] Calculate eBay final value fee (category-specific, 13-15%)
- [ ] Calculate payment processing fee (~2.9%)
- [ ] Show "Net profit" preview before listing
- [ ] Allow cost basis input for margin calculation
- [ ] Suggest price based on margin target

**Fee Calculation:**
```javascript
function calculateNetProfit(salePrice, category, costBasis) {
  const fvf = salePrice * 0.13; // ~13% final value fee
  const paymentFee = salePrice * 0.029 + 0.30;
  const netRevenue = salePrice - fvf - paymentFee;
  const profit = netRevenue - costBasis;
  return { netRevenue, profit, margin: profit / costBasis };
}
```

**Effort:** 2 days

---

### F-CRE008: SKU Generation Rules
**Priority:** 🟡 Medium  
**Current State:** `SKU_PREFIX = 'wi_'` + ASIN  
**Gap:** No customization, no duplicate detection

**Requirements:**
- [ ] Allow custom SKU prefix per user
- [ ] Check for existing SKU before creation
- [ ] Support SKU patterns (e.g., `{PREFIX}_{ASIN}_{CONDITION}`)
- [ ] Handle re-listing same ASIN (different condition)

**Effort:** 1 day

---

### F-CRE009: Draft Listing Support
**Priority:** 🟢 Low  
**Current State:** Listings publish immediately or fail  
**Gap:** No way to save and review before publishing

**Requirements:**
- [ ] Create inventory item without publishing offer
- [ ] Store draft state in database
- [ ] UI for reviewing/editing drafts
- [ ] Batch publish drafts

**Effort:** 2-3 days

---

## Part 3: Price Management Gaps

### F-PRC001: Strategy-Based Scheduling
**Priority:** 🔴 Critical  
**Current State:** `process-price-reductions.js` uses per-listing settings  
**Gap:** Not fully integrated with strategies table

**n8n Workflow Reference:**
```sql
SELECT l.*, s.reduction_percentage, s.frequency_days
FROM listings l
JOIN strategies s ON l.strategy_id = s.id
WHERE l.enable_auto_reduction = true
```

**Requirements:**
- [ ] Join strategies table in price reduction query
- [ ] Use `strategies.reduction_amount` (percentage or dollar)
- [ ] Use `strategies.frequency_days` for interval
- [ ] Allow "no strategy" (use listing-level settings)
- [ ] Support strategy modification propagation

**Current Implementation:**
```javascript
// In process-price-reductions.js
const reductionPercentage = parseFloat(listing.reduction_percentage || 2);
// Should be:
const reductionPercentage = listing.strategy?.reduction_amount || listing.reduction_percentage || 2;
```

**Effort:** 2 days

---

### F-PRC002: Multi-Type Reduction Support
**Priority:** 🔴 Critical  
**Current State:** Only percentage-based reductions  
**Gap:** Strategies table supports 'dollar' type but not implemented

**Requirements:**
- [ ] Implement dollar-amount reductions
- [ ] Handle: "Reduce by $1.00 every 3 days"
- [ ] Rounding rules for dollar amounts
- [ ] Mixed strategies within same account

**Code Change:**
```javascript
function calculateNewPrice(listing, strategy) {
  if (strategy.reduction_type === 'dollar') {
    return Math.max(listing.current_price - strategy.reduction_amount, listing.minimum_price);
  } else {
    return Math.max(listing.current_price * (1 - strategy.reduction_amount/100), listing.minimum_price);
  }
}
```

**Effort:** 1 day

---

### F-PRC003: Minimum Price Enforcement
**Priority:** 🔴 High  
**Current State:** `minimum_price` checked but not always enforced  
**Gap:** Edge cases can result in prices below minimum

**Requirements:**
- [ ] Validate minimum_price > 0 and < current_price on setting
- [ ] Never allow reduction below minimum_price
- [ ] Alert user when price floor reached
- [ ] Option to pause reduction at minimum (current) vs. stop entirely

**Effort:** 1 day

---

### F-PRC004: Price Change Logging & History
**Priority:** 🔴 High  
**Current State:** `price_reduction_logs` table exists but sparse data  
**Gap:** Incomplete audit trail, no rollback capability

**Requirements:**
- [ ] Log every price change with: old_price, new_price, reason, source
- [ ] Support manual vs automatic distinction
- [ ] Enable price history chart in UI
- [ ] Add "revert to previous price" functionality

**Table Enhancement:**
```sql
ALTER TABLE price_reduction_logs
ADD COLUMN change_source TEXT CHECK (change_source IN ('automatic', 'manual', 'sync', 'rollback')),
ADD COLUMN triggered_by UUID REFERENCES auth.users(id);
```

**Effort:** 2 days

---

### F-PRC005: Competitive Pricing Engine
**Priority:** 🟡 High  
**Current State:** No market price awareness  
**Gap:** Reductions are blind to competitor prices

**Phase 4 Reference:**
> "Market analysis service should provide competitor price data"

**Requirements:**
- [ ] Fetch competitor listings via Browse API
- [ ] Calculate market average, median, low
- [ ] Adjust reduction strategy based on market position
- [ ] "Price to beat lowest" mode
- [ ] "Stay 5% below market average" mode

**API Call:**
```javascript
GET /buy/browse/v1/item_summary/search?q={title}&category_ids={cat}
// Limit: 5,000/day - requires caching
```

**Effort:** 4-5 days

---

### F-PRC006: Trading API Bulk Price Update
**Priority:** 🟡 High  
**Current State:** `update-price-trading-api.js` uses single-item updates  
**Gap:** Inefficient for bulk price reductions

**Requirements:**
- [ ] Implement `ReviseInventoryStatus` for batch updates (4 items/call)
- [ ] Queue batches for rate limit compliance
- [ ] Fallback to single-item on batch failure

**XML Template:**
```xml
<ReviseInventoryStatusRequest>
  <InventoryStatus>
    <ItemID>12345</ItemID>
    <StartPrice>19.99</StartPrice>
  </InventoryStatus>
  <InventoryStatus>
    <ItemID>12346</ItemID>
    <StartPrice>24.99</StartPrice>
  </InventoryStatus>
</ReviseInventoryStatusRequest>
```

**Effort:** 2 days

---

### F-PRC007: Price Reduction Scheduling
**Priority:** 🟡 Medium  
**Current State:** Reductions run when function is called  
**Gap:** No guaranteed scheduling, relies on manual triggers or external scheduler

**Requirements:**
- [ ] Calculate `next_price_reduction` timestamp per listing
- [ ] Netlify scheduled function or external cron
- [ ] Process listings in priority order (oldest next_reduction first)
- [ ] Handle timezone considerations

**Netlify Config:**
```toml
[functions."process-price-reductions-scheduled"]
schedule = "0 */4 * * *"  # Every 4 hours
```

**Effort:** 1-2 days

---

### F-PRC008: Price Ceiling/Floor Alerts
**Priority:** 🟡 Medium  
**Current State:** No alerting system  
**Gap:** User doesn't know when prices hit minimum

**Requirements:**
- [ ] Alert when listing reaches minimum_price
- [ ] Alert when X% of listings are at floor
- [ ] Suggest strategy adjustment
- [ ] In-app notification + optional email

**Effort:** 2 days

---

### F-PRC009: Pause/Resume Automation
**Priority:** 🟢 Low  
**Current State:** On/off toggle only  
**Gap:** Cannot temporarily pause without losing settings

**Requirements:**
- [ ] "Pause until [date]" option
- [ ] "Pause all" account-level toggle
- [ ] Resume retains next_reduction schedule

**Effort:** 1 day

---

## Part 4: API Integration Gaps

### F-API001: eBay Token Refresh Automation
**Priority:** 🔴 Critical  
**Current State:** `ebay-oauth.js` has refresh logic, not always triggered  
**Gap:** Tokens expire after 2 hours, no proactive refresh

**Requirements:**
- [ ] Background refresh tokens before expiration (5 min buffer)
- [ ] Store `token_expires_at` in database
- [ ] Retry logic for failed refreshes
- [ ] Alert user if refresh fails (re-auth needed)
- [ ] Handle refresh_token expiration (18 months)

**Current Implementation Check:**
```javascript
// In getValidAccessToken():
if (Date.now() > expiresAt - 5 * 60 * 1000) {
  // Refresh token - this exists but needs verification
}
```

**Effort:** 1-2 days

---

### F-API002: Keepa Rate Limit Management
**Priority:** 🔴 Critical  
**Current State:** No visible rate limit handling  
**Gap:** Exceeding Keepa limits causes service interruption

**Keepa Limits:**
| Plan | Tokens/Minute | Tokens/Month |
|------|---------------|--------------|
| 20/min | 20 | 892,800 |
| 60/min | 60 | 2,678,400 |

**Requirements:**
- [ ] Track token usage in database per user
- [ ] Implement token bucket rate limiter
- [ ] Queue requests when near limit
- [ ] Show user remaining tokens in UI
- [ ] Fallback to cached data when depleted

**New Table:**
```sql
CREATE TABLE keepa_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  tokens_used INT NOT NULL,
  operation VARCHAR(50), -- 'product', 'search', 'finder'
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effort:** 3 days

---

### F-API003: eBay Platform Notifications (Webhooks)
**Priority:** 🔴 High  
**Current State:** Not implemented  
**Gap:** Real-time sync requires polling instead of push

**Notification Types Needed:**
| Topic | Use Case |
|-------|----------|
| `MARKETPLACE_ACCOUNT_DELETION` | User revokes access |
| `ITEM_SOLD` | Update quantity, mark sold |
| `ITEM_ENDED` | Mark listing ended |
| `ITEM_REVISED` | Sync external changes |
| `ITEM_PRICE_CHANGE` | Detect manual price changes |

**Requirements:**
- [ ] Register webhook endpoint with eBay
- [ ] Implement signature verification
- [ ] Process notification payloads
- [ ] Update local database in real-time
- [ ] Fallback to polling if webhook fails

**Webhook Endpoint:**
```javascript
// netlify/functions/ebay-webhook.js
exports.handler = async (event) => {
  const signature = event.headers['x-ebay-signature'];
  if (!verifySignature(signature, event.body)) {
    return { statusCode: 401 };
  }
  
  const notification = JSON.parse(event.body);
  await processNotification(notification);
  return { statusCode: 200 };
};
```

**Effort:** 4-5 days

---

### F-API004: Browse API Integration
**Priority:** 🟡 High  
**Current State:** Not implemented  
**Gap:** No competitor price data for market analysis

**Required Endpoints:**
| Endpoint | Use Case |
|----------|----------|
| `item_summary/search` | Find competing listings |
| `item/{item_id}` | Get detailed item data |

**Rate Limit:** 5,000 calls/day (Application token)

**Requirements:**
- [ ] Implement Browse API client
- [ ] Cache search results (30 min TTL)
- [ ] Aggregate competitor metrics
- [ ] Respect daily call limits

**Effort:** 2-3 days

---

### F-API005: Taxonomy API Caching
**Priority:** 🟡 Medium  
**Current State:** Categories fetched but 7,111 stored  
**Gap:** Not all aspects cached, repeated API calls

**Requirements:**
- [ ] Cache category tree in database
- [ ] Cache aspects per category (already in `ebay_category_aspects_cache`)
- [ ] Refresh cache monthly
- [ ] Fallback to API if cache miss

**Effort:** 1-2 days

---

### F-API006: Account API Integration
**Priority:** 🟡 Medium  
**Current State:** Policies hardcoded, no account data  
**Gap:** Cannot fetch seller performance, policies

**Required Endpoints:**
| Endpoint | Use Case |
|----------|----------|
| `GET /sell/account/v1/fulfillment_policy` | Shipping policies |
| `GET /sell/account/v1/return_policy` | Return policies |
| `GET /sell/account/v1/payment_policy` | Payment policies |
| `GET /sell/account/v1/privilege` | Seller performance |

**Requirements:**
- [ ] Fetch policies on OAuth connect
- [ ] Store and display seller level
- [ ] Warn on restrictions that affect features

**Effort:** 2 days

---

### F-API007: Fulfillment API Integration
**Priority:** 🟡 Medium  
**Current State:** Not implemented  
**Gap:** No order/sales tracking

**Required Endpoints:**
| Endpoint | Use Case |
|----------|----------|
| `GET /sell/fulfillment/v1/order` | Get recent orders |

**Requirements:**
- [ ] Fetch orders for sold item correlation
- [ ] Update listing `quantity_sold`
- [ ] Track sale price for analytics
- [ ] Calculate actual profit (vs. estimated)

**Effort:** 3 days

---

### F-API008: Claude API Cost Controls
**Priority:** 🟡 Medium  
**Current State:** No tracking of AI usage  
**Gap:** Cannot monitor or limit AI costs per user

**Requirements:**
- [ ] Log Claude API calls per user
- [ ] Track input/output tokens
- [ ] Set monthly limits per tier
- [ ] Cache common AI outputs (same ASIN = same title)

**New Table:**
```sql
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  model VARCHAR(50), -- 'claude-3-haiku', etc.
  input_tokens INT,
  output_tokens INT,
  operation VARCHAR(50), -- 'generate_title', 'describe', 'categorize'
  cached BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effort:** 2 days

---

### F-API009: Keepa Batch Product Lookup
**Priority:** 🟢 Low  
**Current State:** Single ASIN lookups only  
**Gap:** Inefficient for bulk operations

**Keepa supports up to 100 ASINs per call**

**Requirements:**
- [ ] Implement batch product endpoint
- [ ] Parallelize with rate limiting
- [ ] Aggregate results efficiently

**Effort:** 1-2 days

---

## Part 5: Background Processing Gaps

### F-BG001: Scheduled Job Framework
**Priority:** 🔴 Critical  
**Current State:** `scheduled-jobs.js.bak` exists but not active  
**Gap:** No reliable scheduled execution

**Required Jobs:**
| Job | Frequency | Function |
|-----|-----------|----------|
| Price reductions | Every 4 hours | `process-price-reductions.js` |
| Listing sync | Every 6 hours | `sync-ebay-listings.js` |
| Ended detection | Every 12 hours | `deactivate-ended-listings.js` |
| Token refresh | Every hour | Token maintenance |
| Metrics refresh | Daily | Materialized view refresh |

**Netlify Config:**
```toml
[functions."scheduled-price-reduction"]
schedule = "0 */4 * * *"

[functions."scheduled-sync"]
schedule = "0 */6 * * *"

[functions."scheduled-cleanup"]
schedule = "0 0 * * *"
```

**Effort:** 2-3 days

---

### F-BG002: Job Queue System
**Priority:** 🔴 High  
**Current State:** `sync_queue` table exists but not actively used  
**Gap:** Long-running jobs timeout, no retry mechanism

**Requirements:**
- [ ] Implement queue processor for long-running jobs
- [ ] Support job priorities
- [ ] Retry failed jobs with exponential backoff
- [ ] Job status visibility in UI
- [ ] Dead letter queue for persistent failures

**Queue Implementation:**
```javascript
// Queue a job
await supabase.from('sync_queue').insert({
  user_id: userId,
  job_type: 'full_sync',
  priority: 1,
  status: 'pending',
  payload: { /* job-specific data */ }
});

// Process next job
const { data: job } = await supabase
  .from('sync_queue')
  .select('*')
  .eq('status', 'pending')
  .order('priority', { ascending: true })
  .order('created_at', { ascending: true })
  .limit(1)
  .single();
```

**Effort:** 3-4 days

---

### F-BG003: Materialized View Refresh
**Priority:** 🟡 Medium  
**Current State:** `user_listing_stats` and `category_stats` views exist  
**Gap:** No automated refresh

**Requirements:**
- [ ] Schedule `REFRESH MATERIALIZED VIEW CONCURRENTLY` daily
- [ ] Add more aggregate views for analytics
- [ ] Monitor refresh performance

**SQL Needed:**
```sql
CREATE OR REPLACE FUNCTION refresh_all_materialized_views()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY user_listing_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY category_stats;
END;
$$ LANGUAGE plpgsql;
```

**Effort:** 1 day

---

### F-BG004: Error Recovery & Alerting
**Priority:** 🟡 Medium  
**Current State:** Errors logged but not monitored  
**Gap:** No alerting when background jobs fail

**Requirements:**
- [ ] Log all job failures to dedicated table
- [ ] Alert admin on repeated failures (email/Slack)
- [ ] Auto-retry with backoff
- [ ] Dashboard for job health

**Effort:** 2 days

---

### F-BG005: Data Cleanup Jobs
**Priority:** 🟡 Medium  
**Current State:** No cleanup of old data  
**Gap:** Database grows indefinitely

**Cleanup Tasks:**
- [ ] Delete `sync_errors` older than 30 days
- [ ] Archive `price_history` older than 90 days
- [ ] Clean `oauth_states` older than 1 hour
- [ ] Purge orphaned import_errors

**Effort:** 1 day

---

### F-BG006: Webhook Processing Queue
**Priority:** 🟢 Low  
**Current State:** `webhook_events` table exists but not used  
**Gap:** No webhook processing pipeline

**Requirements:**
- [ ] Store incoming webhooks immediately
- [ ] Process asynchronously
- [ ] Mark processed/failed status
- [ ] Retry failed processing

**Effort:** 2 days

---

## Part 6: Data Management Gaps

### F-DAT001: Audit Trail System
**Priority:** 🟡 High  
**Current State:** Partial logging via price_reduction_logs  
**Gap:** No comprehensive audit trail

**Requirements:**
- [ ] Log all data-modifying operations
- [ ] Include: who, what, when, before/after values
- [ ] Support compliance requirements
- [ ] Enable rollback capability

**New Table:**
```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(10) CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Effort:** 3 days

---

### F-DAT002: Data Export Functionality
**Priority:** 🟡 Medium  
**Current State:** No export capability  
**Gap:** Users cannot export their data

**Requirements:**
- [ ] Export listings to CSV/JSON
- [ ] Export price history
- [ ] Export analytics data
- [ ] Scheduled reports (email PDF)

**Effort:** 2-3 days

---

## Priority Summary & Implementation Roadmap

### 🔴 Critical (MVP Blockers) - 10 Items
**Estimated Total Effort:** 25-35 days

| Gap | Description | Effort |
|-----|-------------|--------|
| F-IMP001 | Bulk import rate handling | 3-4 days |
| F-IMP002 | Incremental sync | 4-5 days |
| F-CRE001 | Batch ASIN processing | 4-5 days |
| F-CRE002 | Required aspects population | 3-4 days |
| F-PRC001 | Strategy-based scheduling | 2 days |
| F-PRC002 | Multi-type reductions | 1 day |
| F-API001 | Token refresh automation | 1-2 days |
| F-API002 | Keepa rate limit management | 3 days |
| F-BG001 | Scheduled job framework | 2-3 days |

### 🔴 High Priority - 17 Items
**Estimated Total Effort:** 35-45 days

| Gap | Description | Effort |
|-----|-------------|--------|
| F-IMP003 | Ended listing detection | 2-3 days |
| F-IMP004 | Source tracking | 1 day |
| F-IMP005 | Offer ID tracking | 2 days |
| F-IMP010 | Import error logging | 2-3 days |
| F-CRE003 | Business policy validation | 2-3 days |
| F-CRE004 | Merchant location management | 1-2 days |
| F-CRE005 | Condition mapping | 2 days |
| F-PRC003 | Minimum price enforcement | 1 day |
| F-PRC004 | Price change logging | 2 days |
| F-PRC005 | Competitive pricing engine | 4-5 days |
| F-PRC006 | Trading API bulk update | 2 days |
| F-API003 | eBay webhooks | 4-5 days |
| F-API004 | Browse API integration | 2-3 days |
| F-BG002 | Job queue system | 3-4 days |
| F-DAT001 | Audit trail | 3 days |

---

## Recommended Implementation Phases

### Phase 1: Core Reliability (Weeks 1-3)
Focus on making existing features work reliably at scale.

1. F-IMP001: Import rate handling
2. F-IMP004/F-IMP005: Source and offer ID tracking
3. F-API001: Token refresh
4. F-PRC001/F-PRC002: Strategy integration
5. F-BG001: Scheduled jobs

### Phase 2: Feature Completion (Weeks 4-6)
Complete the listing creation flow.

1. F-CRE002: Required aspects
2. F-CRE003/F-CRE004: Policies and location
3. F-IMP002: Incremental sync
4. F-API002: Keepa rate limits
5. F-BG002: Job queue

### Phase 3: Scale & Intelligence (Weeks 7-9)
Enable growth and add market intelligence.

1. F-CRE001: Batch ASIN processing
2. F-PRC005: Competitive pricing
3. F-API003: eBay webhooks
4. F-API004: Browse API
5. F-DAT001: Audit trail

### Phase 4: Polish & Optimization (Weeks 10-12)
Improve efficiency and user experience.

1. F-IMP007: Metrics sync
2. F-CRE006: Image re-hosting
3. F-CRE007: Fee calculation
4. F-BG003-F-BG006: Background job improvements
5. F-DAT002: Data export

---

## Appendix: Database Schema Additions Summary

```sql
-- User profile additions
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS
  last_full_sync TIMESTAMPTZ,
  last_delta_sync TIMESTAMPTZ,
  sync_mode TEXT DEFAULT 'full',
  ebay_fulfillment_policy_id VARCHAR(50),
  ebay_payment_policy_id VARCHAR(50),
  ebay_return_policy_id VARCHAR(50),
  ebay_merchant_location_key VARCHAR(100);

-- Listings additions
ALTER TABLE listings ADD COLUMN IF NOT EXISTS
  ended_at TIMESTAMPTZ,
  ended_reason TEXT,
  sold_price DECIMAL(10,2),
  sold_at TIMESTAMPTZ,
  parent_listing_id UUID REFERENCES listings(id),
  variation_attributes JSONB;

-- New tables needed
-- import_errors
-- listing_metrics_history
-- keepa_usage
-- ai_usage
-- audit_log
```

---

## Cross-Reference: Related Gap Documents

| Document | Scope |
|----------|-------|
| REQUIREMENT-GAPS-DOMAIN-BUSINESS.md | eBay/Amazon domain constraints, monetization |
| REQUIREMENT-GAPS-USER.md | UI/UX, personas, accessibility |
| **REQUIREMENT-GAPS-FUNCTIONAL.md** (this) | Backend implementation, APIs, data |

---

*Document maintained by Functional Requirements Analyst Agent*  
*Last updated: January 2026*
