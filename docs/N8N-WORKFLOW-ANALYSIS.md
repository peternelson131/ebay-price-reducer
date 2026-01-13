# n8n Workflow Analysis - eBay Repricing System

## Overview

Pete's n8n workflows handle eBay listing import and automatic price reduction. The goal is to migrate this logic into the eBay Price Reducer app.

## Active Workflows (Repricing Related)

### 1. ActivateRepricing
**Schedule:** Periodic trigger
**Purpose:** Automatically enable repricing for new listings

**Logic:**
```sql
SELECT * FROM listings
WHERE listing_status = 'Active'
AND enable_auto_reduction = 'false'
AND created_at > current_date - 2
AND ebay_sku LIKE 'WI_%'
ORDER BY created_at DESC
```

Then updates `enable_auto_reduction = true` for matched listings.

---

### 2. InventoryAPI-UpdateEbayPrice
**Schedule:** Periodic trigger
**Purpose:** Update prices for Inventory API listings

**Flow:**
1. **GetSkusToCutPrice** - SQL query to find listings needing price reduction
2. **GetOfferID** - Call eBay to get offer ID: `GET /sell/inventory/v1/offer?sku={sku}`
3. **UpdateOfferPrice** - Update eBay: `PUT /sell/inventory/v1/offer/{offerId}`
4. **UpdateExistingSku** - Update local database
5. Calls XML-Trading API-UpdatePrice for legacy listings

**Key SQL Logic:**
```sql
SELECT
  l.id,
  ebay_sku,
  current_price,
  minimum_price,
  GREATEST(
    ROUND((l.current_price * ((100 - s.reduction_percentage) / 100)), 2),
    COALESCE(l.minimum_price, 0)
  ) AS new_price,
  last_price_update,
  l.strategy_id
FROM listings l
JOIN strategies s ON l.strategy_id = s.id
WHERE 
  l.enable_auto_reduction = true
  AND l.listing_status = 'Active'
  AND (l.last_price_update IS NULL OR l.last_price_update < NOW() - INTERVAL '? days')
  AND l.current_price > l.minimum_price
```

---

### 3. XML-Trading API-UpdatePrice
**Trigger:** Called by InventoryAPI-UpdateEbayPrice
**Purpose:** Update prices for Trading API (legacy XML) listings

**Flow:**
1. **GetSkusToCutPrice** - SQL query (includes ebay_item_id)
2. **Build XML Request** - Construct ReviseFixedPriceItemRequest
3. **EndListing** - Call Trading API: `POST https://api.ebay.com/ws/api.dll`
4. **UpdateExistingSku** - Update local database

**XML Template:**
```xml
<?xml version="1.0" encoding="utf-8"?>
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <Item>
    <ItemID>{ebay_item_id}</ItemID>
    <StartPrice>{new_price}</StartPrice>
  </Item>
</ReviseFixedPriceItemRequest>
```

---

## Import Workflows

### 1-ImporteBayListings Trading API - 1-200
**Purpose:** Import active listings from eBay Trading API (page 1)

**Flow:**
1. Build GetMyeBaySelling XML request
2. Call Trading API
3. Parse XML response
4. Insert/Update listings in PostgreSQL
5. Call next page workflow (200-400)

### 2-ImporteBayListings Trading API - 200-400
**Purpose:** Import page 2 of listings

### 1-InventoryAPI-ebayImportNewInventoryApiSkus
**Purpose:** Import listings created via Inventory API

---

## Database Schema (from n8n)

### listings table columns used:
- `id` (UUID)
- `ebay_sku` (VARCHAR)
- `ebay_item_id` (VARCHAR) - for Trading API listings
- `current_price` (DECIMAL)
- `minimum_price` (DECIMAL)
- `listing_status` (VARCHAR) - 'Active', 'Ended', etc.
- `enable_auto_reduction` (BOOLEAN)
- `strategy_id` (UUID FK)
- `last_price_update` (TIMESTAMP)
- `created_at` (TIMESTAMP)

### strategies table columns:
- `id` (UUID)
- `reduction_percentage` (DECIMAL)
- `frequency_days` (INTEGER)

---

## Migration Plan

### Phase 1: Database Alignment
- [ ] Add `enable_auto_reduction` column to listings
- [ ] Add `last_price_update` column to listings
- [ ] Ensure `ebay_item_id` exists for Trading API listings
- [ ] Add `frequency_days` to strategies if missing

### Phase 2: Import Function
- [ ] Create `sync-ebay-listings.js` Netlify function
- [ ] Support both Trading API and Inventory API imports
- [ ] Handle pagination
- [ ] Upsert logic for existing SKUs

### Phase 3: Price Reduction Engine
- [ ] Create `process-price-reductions.js` scheduled function
- [ ] Implement the GREATEST() price calculation logic
- [ ] Support both Inventory API and Trading API updates
- [ ] Handle rate limits (Trading API: 5000/day, Inventory API: 2M/day)

### Phase 4: Activation Logic
- [ ] Create auto-activation for new listings
- [ ] Match SKU patterns (e.g., 'WI_%')
- [ ] Configurable activation rules

---

## API Endpoints Required

### eBay Inventory API
- `GET /sell/inventory/v1/offer?sku={sku}` - Get offer by SKU
- `PUT /sell/inventory/v1/offer/{offerId}` - Update offer price
- `POST /sell/inventory/v1/bulk_update_price_quantity` - Bulk update (25 items/call)

### eBay Trading API
- `POST /ws/api.dll` with:
  - GetMyeBaySellingRequest - List active items
  - ReviseFixedPriceItemRequest - Update price
  - ReviseInventoryStatusRequest - Bulk update (4 items/call)

---

## Key Differences Between Listing Types

| Aspect | Trading API Listings | Inventory API Listings |
|--------|---------------------|------------------------|
| Identifier | `ebay_item_id` | `ebay_sku` → `offerId` |
| Price Update | ReviseFixedPriceItem | PUT /offer/{offerId} |
| Bulk Update | ReviseInventoryStatus (4/call) | bulkUpdatePriceQuantity (25/call) |
| Auth | OAuth User Token | OAuth User Token |

---

## Notes

- Workflows use PostgreSQL directly (not Supabase client)
- Rate limiting handled via Wait nodes (1 second between items)
- Error handling via separate eBayListingErrorLogger workflow
- Some listings may be in both systems (need deduplication)
