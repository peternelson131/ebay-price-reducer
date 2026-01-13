# eBay Listing Import Process Specification

## Overview

The import process syncs eBay listings to the database from two sources:
1. **Trading API** (XML) - Legacy listings with ItemID
2. **Inventory API** (REST) - Modern listings with SKU/OfferID

---

## Listing Lifecycle States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LISTING LIFECYCLE                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [NEW]  ──Import──▶  [ACTIVE]  ──Sold Out──▶  [SOLD_OUT]                  │
│                          │                          │                        │
│                          │                          │ Restock                │
│                          │                          ▼                        │
│                          │                    [ACTIVE] again                 │
│                          │                                                   │
│                          │──Ended by Seller──▶  [ENDED]                     │
│                          │                                                   │
│                          │──Expired──────────▶  [ENDED]                     │
│                          │                                                   │
│                          │──Removed by eBay──▶  [REMOVED]                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Status Values
| Status | Description | Auto-Reduce? |
|--------|-------------|--------------|
| `Active` | Live on eBay, has quantity | ✅ Yes |
| `SoldOut` | qty_available = 0, still listed | ❌ No |
| `Ended` | Seller ended or expired | ❌ No |
| `Removed` | eBay removed (policy) | ❌ No |

---

## CRITICAL: What to Sync vs. What to Preserve

### ✅ ALWAYS UPDATE from eBay (sync overwrites)
| Field | Reason |
|-------|--------|
| `title` | Seller may edit on eBay |
| `quantity_available` | Changes with sales |
| `quantity_sold` | Increments with sales |
| `listing_status` | May end/sell out |
| `image_url` | Seller may update |
| `ebay_url` | Should match eBay |
| `last_sync` | Track sync time |

### ❌ NEVER OVERWRITE (preserve app data)
| Field | Reason |
|-------|--------|
| `current_price` | **WE control price reductions** |
| `minimum_price` | User-set floor |
| `enable_auto_reduction` | User preference |
| `strategy_id` | User assignment |
| `last_price_reduction` | Our tracking |
| `total_reductions` | Our counter |

### ⚠️ CONDITIONAL UPDATE
| Field | Rule |
|-------|------|
| `current_price` | Only on **first import** (when record is new) |
| `original_price` | Set once on first import, never update |
| `minimum_price` | Set to `current_price * 0.6` only on first import |

---

## Sold Out / Restock Handling

### When Listing Sells Out (qty_available = 0)
```javascript
// On sync, if qty_available drops to 0:
if (ebayListing.quantity_available === 0) {
  await supabase.from('listings').update({
    quantity_available: 0,
    listing_status: 'SoldOut',
    // DO NOT touch: current_price, minimum_price, enable_auto_reduction
  }).eq('id', listing.id);
}
```

### When Listing is Restocked (qty goes from 0 to >0)
```javascript
// On sync, if qty_available goes back up:
if (dbListing.quantity_available === 0 && ebayListing.quantity_available > 0) {
  await supabase.from('listings').update({
    quantity_available: ebayListing.quantity_available,
    listing_status: 'Active',
    // Preserve all price reduction settings!
  }).eq('id', listing.id);
}
```

### Why This Matters
- User may restock a sold-out listing
- We want to **resume** price reductions with existing settings
- Don't reset `minimum_price`, `strategy_id`, or `enable_auto_reduction`

---

## Price Sync Logic - CRITICAL

### The Problem
eBay has price X, our DB has price Y (from our reductions). Who wins?

### The Rule
```
OUR DATABASE PRICE IS THE SOURCE OF TRUTH FOR ACTIVE LISTINGS
```

### Implementation
```javascript
async function syncListing(ebayData, dbListing) {
  const updates = {
    // Always sync these
    title: ebayData.title,
    quantity_available: ebayData.quantity_available,
    quantity_sold: ebayData.quantity_sold,
    listing_status: deriveStatus(ebayData),
    last_sync: new Date().toISOString(),
  };
  
  // FIRST IMPORT: Set initial prices
  if (!dbListing) {
    updates.current_price = ebayData.price;
    updates.original_price = ebayData.price;  // Never changes after this
    updates.minimum_price = ebayData.price * 0.6;
    updates.enable_auto_reduction = false;    // User must enable
  }
  
  // EXISTING LISTING: Never overwrite price!
  // Our price reductions control current_price
  
  return updates;
}
```

### Edge Case: Price Mismatch Detection
```javascript
// Log if eBay price differs from our DB (means manual edit on eBay)
if (dbListing && Math.abs(dbListing.current_price - ebayData.price) > 0.01) {
  console.warn(`Price mismatch for ${dbListing.id}:
    DB: $${dbListing.current_price}
    eBay: $${ebayData.price}
    Keeping DB price (our reductions control this)`);
    
  // Optionally log to a discrepancy table for review
}
```

---

## Critical Fields for Price Updates

| Field | Trading API | Inventory API | Required For |
|-------|-------------|---------------|--------------|
| `source` | `'trading_api'` | `'inventory_api'` | API routing |
| `ebay_item_id` | ✅ Required | ✅ From offer.listingId | Trading API updates |
| `ebay_sku` | Optional | ✅ Required | Inventory API updates |
| `offer_id` | N/A | ✅ Required | Inventory API price updates |

---

## Import Flow 1: Trading API (XML)

### Step 1: Call GetMyeBaySelling
```xml
POST https://api.ebay.com/ws/api.dll
X-EBAY-API-CALL-NAME: GetMyeBaySelling
X-EBAY-API-COMPATIBILITY-LEVEL: 967

<GetMyeBaySellingRequest>
  <ActiveList>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>
```

### Step 2: Extract Fields from XML Response
```javascript
const listing = {
  ebay_item_id: item.ItemID,           // CRITICAL - needed for ReviseFixedPriceItem
  ebay_sku: item.SKU || null,          // May or may not exist
  title: item.Title,
  current_price: parseFloat(item.SellingStatus.CurrentPrice),
  quantity_available: parseInt(item.QuantityAvailable),
  quantity_sold: parseInt(item.SellingStatus.QuantitySold),
  listing_status: item.SellingStatus.ListingStatus,
  image_url: item.PictureDetails?.GalleryURL,
  ebay_url: item.ListingDetails?.ViewItemURL,
  source: 'trading_api',               // CRITICAL - marks as Trading API
};
```

### Step 3: Upsert to Database (PRESERVING PRICES)
```sql
INSERT INTO listings (
  user_id, ebay_item_id, ebay_sku, title, current_price, original_price,
  quantity_available, quantity_sold, listing_status,
  image_url, ebay_url, source, minimum_price, last_sync, updated_at
) VALUES (
  $user_id, 
  $ebay_item_id, 
  $ebay_sku, 
  $title, 
  $price,                              -- current_price (only for new)
  $price,                              -- original_price (only for new)
  $qty_available, 
  $qty_sold, 
  $status,
  $image_url, 
  $ebay_url, 
  'trading_api',                       -- source
  $price * 0.6,                        -- minimum_price (only for new)
  NOW(), 
  NOW()
)
ON CONFLICT (ebay_item_id) 
DO UPDATE SET
  -- ✅ SYNC from eBay
  title = EXCLUDED.title,
  quantity_available = EXCLUDED.quantity_available,
  quantity_sold = EXCLUDED.quantity_sold,
  listing_status = EXCLUDED.listing_status,
  image_url = EXCLUDED.image_url,
  ebay_url = EXCLUDED.ebay_url,
  last_sync = NOW(),
  updated_at = NOW()
  -- ❌ NOT UPDATED: current_price, original_price, minimum_price
  -- ❌ NOT UPDATED: enable_auto_reduction, strategy_id
  -- ❌ NOT UPDATED: last_price_reduction, total_reductions
;
```

---

## Import Flow 2: Inventory API (REST)

### Step 1: Get All Inventory Items
```javascript
GET https://api.ebay.com/sell/inventory/v1/inventory_item?limit=200&offset=0
```

Response:
```json
{
  "inventoryItems": [{
    "sku": "WI_B0ABC123",
    "product": {
      "title": "Product Title",
      "imageUrls": ["https://..."]
    },
    "availability": {
      "shipToLocationAvailability": {
        "quantity": 5
      }
    }
  }],
  "total": 150
}
```

### Step 2: Get Offer Details for Each SKU
```javascript
GET https://api.ebay.com/sell/inventory/v1/offer?sku=WI_B0ABC123
```

Response:
```json
{
  "offers": [{
    "offerId": "123456789",              // CRITICAL - needed for price updates
    "sku": "WI_B0ABC123",
    "listingId": "234567890123",         // This IS ebay_item_id
    "status": "PUBLISHED",
    "pricingSummary": {
      "price": { "value": "24.99", "currency": "USD" }
    }
  }]
}
```

### Step 3: Upsert to Database (PRESERVING PRICES)
```sql
INSERT INTO listings (
  user_id, ebay_sku, ebay_item_id, offer_id, title, current_price, original_price,
  quantity_available, listing_status, image_url, source,
  minimum_price, last_sync, updated_at
) VALUES (
  $user_id, 
  $ebay_sku,                             -- ebay_sku
  $listing_id,                           -- ebay_item_id (from offer.listingId)
  $offer_id,                             -- offer_id (CRITICAL for price updates)
  $title, 
  $price,                                -- current_price (only for new)
  $price,                                -- original_price (only for new)
  $qty_available, 
  'Active',
  $image_url,
  'inventory_api',                       -- source
  $price * 0.6,                          -- minimum_price (only for new)
  NOW(), 
  NOW()
)
ON CONFLICT (ebay_sku) 
DO UPDATE SET
  -- ✅ SYNC from eBay (always update)
  ebay_item_id = EXCLUDED.ebay_item_id,
  offer_id = EXCLUDED.offer_id,          -- May change if listing is re-created
  title = EXCLUDED.title,
  quantity_available = EXCLUDED.quantity_available,
  listing_status = EXCLUDED.listing_status,
  image_url = EXCLUDED.image_url,
  last_sync = NOW(),
  updated_at = NOW()
  -- ❌ NOT UPDATED: current_price, original_price, minimum_price
  -- ❌ NOT UPDATED: enable_auto_reduction, strategy_id
  -- ❌ NOT UPDATED: last_price_reduction, total_reductions
;
```

---

## Database Column Requirements

### Required for ALL Listings
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner |
| `title` | TEXT | Listing title |
| `current_price` | DECIMAL | Current price |
| `source` | VARCHAR | **`'trading_api'` or `'inventory_api'`** |
| `listing_status` | VARCHAR | 'Active', 'Ended', etc. |
| `last_sync` | TIMESTAMP | Last import timestamp |

### Required for Trading API Listings
| Column | Type | Description |
|--------|------|-------------|
| `ebay_item_id` | VARCHAR | **ItemID - REQUIRED for ReviseFixedPriceItem** |
| `ebay_sku` | VARCHAR | Optional (legacy listings may not have) |

### Required for Inventory API Listings
| Column | Type | Description |
|--------|------|-------------|
| `ebay_sku` | VARCHAR | **SKU - REQUIRED for offer lookup** |
| `ebay_item_id` | VARCHAR | From offer.listingId |
| `offer_id` | VARCHAR | **REQUIRED for bulkUpdatePriceQuantity** |

### Auto-Populated Fields
| Column | Type | Default |
|--------|------|---------|
| `minimum_price` | DECIMAL | `current_price * 0.6` |
| `enable_auto_reduction` | BOOLEAN | `false` |
| `quantity_available` | INTEGER | From eBay |
| `quantity_sold` | INTEGER | From eBay |

---

## Conflict Resolution

### Trading API: Upsert on `ebay_item_id`
- Each ItemID is unique across eBay
- Use ON CONFLICT (ebay_item_id) DO UPDATE

### Inventory API: Upsert on `ebay_sku`
- Each SKU is unique per seller
- Use ON CONFLICT (ebay_sku) DO UPDATE

---

## Detection of Ended Listings

### Trading API
- `listing_status` from GetMyeBaySelling shows 'Ended'
- Or listing no longer appears in results

### Inventory API  
- `offer.status` is not 'PUBLISHED'
- Or offer no longer exists for SKU

### Update Database
```sql
UPDATE listings SET
  listing_status = 'Ended',
  ended_at = NOW()
WHERE ebay_item_id = $1
  AND listing_status != 'Ended';
```

---

## Function Implementation Plan

### `sync-ebay-listings.js` (Scheduled)
```javascript
exports.handler = async () => {
  // 1. Get all users with eBay connected
  // 2. For each user:
  //    a. Import Trading API listings (set source='trading_api')
  //    b. Import Inventory API listings (set source='inventory_api')
  //    c. Fetch offer_id for inventory listings
  //    d. Mark ended listings
  // 3. Log results
};
```

### Schedule
- Run every hour: `0 * * * *`
- Or on-demand via manual trigger

---

## Validation Checklist

Before enabling price reductions on a listing, verify:

- [ ] `source` is set (`'trading_api'` or `'inventory_api'`)
- [ ] For Trading API: `ebay_item_id` exists
- [ ] For Inventory API: `ebay_sku` AND `offer_id` exist
- [ ] `listing_status` is `'Active'`
- [ ] `current_price` > `minimum_price`

---

## Edge Cases & Scenarios

### Scenario 1: Listing Sells Out
```
eBay: qty_available = 0
Action: 
  - Update qty_available = 0
  - Set listing_status = 'SoldOut'
  - KEEP all price settings (for restock)
  - Skip in price reduction jobs
```

### Scenario 2: Listing is Restocked
```
DB: qty_available = 0, listing_status = 'SoldOut'
eBay: qty_available = 5
Action:
  - Update qty_available = 5
  - Set listing_status = 'Active'
  - RESUME price reductions if enable_auto_reduction = true
```

### Scenario 3: Seller Manually Changes Price on eBay
```
DB: current_price = $45.00 (from our reduction)
eBay: price = $50.00 (seller increased it)
Action:
  - DO NOT sync price from eBay
  - Log discrepancy for review
  - Our next reduction will lower from $45, not $50
  - Seller should use app to change prices
```

### Scenario 4: Listing Ended by Seller
```
eBay: listing_status = 'Ended' (or not found)
Action:
  - Set listing_status = 'Ended'
  - Set ended_at = NOW()
  - Skip in all future jobs
  - Preserve all data (seller may relist)
```

### Scenario 5: New Listing Created on eBay
```
DB: No record exists
eBay: New listing found
Action:
  - INSERT new record
  - Set current_price from eBay
  - Set original_price from eBay (never changes)
  - Set minimum_price = price * 0.6
  - Set enable_auto_reduction = false (user enables)
  - Set source appropriately
```

### Scenario 6: Listing Deleted from DB but Active on eBay
```
DB: Record deleted by user
eBay: Listing still active
Action:
  - Re-import as new listing
  - Fresh start with new settings
```

### Scenario 7: eBay Returns Error for Specific Listing
```
Action:
  - Log error with listing ID
  - Continue with other listings
  - Retry on next sync
  - Don't mark as ended (may be temporary)
```

---

## Sync Frequency Recommendations

| Job | Frequency | Purpose |
|-----|-----------|---------|
| Full Import | Every 1 hour | Catch new listings, status changes |
| Price Reductions | Every 4 hours | Apply price drops |
| Ended Check | Every 6 hours | Clean up ended listings |

---

## Data Integrity Rules

### Rule 1: Price Control
```
App controls: current_price, minimum_price
eBay controls: quantity, status, title
```

### Rule 2: Original Price is Immutable
```
original_price is set ONCE on first import
Never updated, even if seller changes price
Used for reporting: "reduced 30% from original"
```

### Rule 3: Source is Immutable
```
source is set on first import
Never changes (trading_api stays trading_api)
Determines which API to use for updates
```

### Rule 4: User Settings Survive Sync
```
enable_auto_reduction - user toggle
strategy_id - user assignment
minimum_price - user can adjust
These NEVER get overwritten by sync
```

---

## Implementation Priority

1. **Phase 1: Basic Import**
   - Import Trading API listings
   - Import Inventory API listings
   - Set source correctly
   - First import sets prices

2. **Phase 2: Safe Sync**
   - Update qty/status without touching prices
   - Handle sold out → active transitions
   - Log price discrepancies

3. **Phase 3: Ended Detection**
   - Mark ended listings
   - Clean up orphaned records

4. **Phase 4: Error Handling**
   - Retry failed imports
   - Alert on persistent failures
