# Import Remaining Requirements

## R1: Schedule Hourly Sync
**Status:** Not Implemented
**Priority:** High

### Requirements
- Add cron schedule to run sync-ebay-listings every hour
- Schedule: `0 * * * *` (top of every hour)
- Should sync both Trading API and Inventory API listings
- Must handle function timeout (60s limit)

### Implementation
1. Add to netlify.toml:
```toml
[functions."sync-ebay-listings-scheduled"]
schedule = "0 * * * *"
```
2. Create wrapper function that calls sync-ebay-listings

### Acceptance Criteria
- [ ] Scheduled function configured in Netlify
- [ ] Runs automatically every hour
- [ ] Logs results for monitoring

---

## R2: Ended Listing Detection
**Status:** Partially Implemented
**Priority:** High

### Current State
- Code exists in `markEndedListings()` function
- Only runs when NOT using `maxListings` limit
- Sets `listing_status = 'Ended'` and `ended_at = NOW()`

### Requirements
- Detect listings in DB that are no longer returned by eBay API
- Mark as 'Ended' with timestamp
- Don't mark as ended when using maxListings (partial sync)
- Handle restocking (ended → active transition)

### Acceptance Criteria
- [ ] Listings not in eBay response marked as 'Ended'
- [ ] `ended_at` timestamp set correctly
- [ ] Restocked listings return to 'Active' status

---

## R3: Duplicate SKU Handling
**Status:** Bug - 4 listings failing
**Priority:** Medium

### Current Issue
```
duplicate key value violates unique constraint "listings_user_ebay_sku_unique"
```

### Root Cause
- Some eBay listings have the same SKU (seller reused SKU)
- Our upsert tries to insert but SKU already exists for user

### Solution Options
1. **Update existing on SKU conflict** - Use ON CONFLICT DO UPDATE
2. **Generate unique SKU** - Append item_id to make unique
3. **Skip duplicates** - Log warning and continue

### Recommended: Option 1 - Update on conflict

### Acceptance Criteria
- [ ] Duplicate SKUs don't cause errors
- [ ] Existing listings updated correctly
- [ ] New listings inserted correctly

---

## R4: Price = $0 Handling  
**Status:** Fixed
**Priority:** Low

### Current Fix
- Default to $0.01 if price is 0 or negative
- Constraint: `check_current_price_positive`

### Acceptance Criteria
- [x] No price constraint violations
- [x] Listings with $0 handled gracefully

---

## Implementation Order

1. **R3: Fix duplicate SKU** (unblocks full sync)
2. **R2: Verify ended detection** (already implemented)
3. **R1: Add hourly schedule** (after R3 fixed)

---

## Testing Plan

### Pre-Production Tests (UAT)
1. Run full sync without maxListings
2. Verify all listings synced (expect ~680 total)
3. Check ended listings marked correctly
4. Verify no duplicate SKU errors

### Production Deployment
1. Merge to main (already done - UAT = prod branch)
2. Verify prod site: ebay-price-reducer-public-platform.netlify.app
3. Run sync on prod
4. Verify scheduled jobs running
