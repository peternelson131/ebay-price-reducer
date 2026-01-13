# n8n eBay Import Workflows - Detailed Analysis

## Overview

Pete's n8n system uses a **chain of 4 workflows** to import and sync eBay listings:

```
┌─────────────────────────────────────────────────────────────────────────┐
│  1. Trading API Import (XML)           2. Inventory API Import          │
│  ─────────────────────────────        ─────────────────────────────     │
│  • GetMyeBaySelling (1-200)            • GET /inventory_item (paginated)│
│  • GetMyeBaySelling (200-400)          • Insert new SKUs to DB          │
│                                        • Call workflow #3               │
│              ↓                                    ↓                     │
│  3. Update SKUs with Offer Data        4. Deactivate Sold Listings      │
│  ─────────────────────────────        ─────────────────────────────     │
│  • GET /offer?sku={sku}                • Find ended/sold listings       │
│  • Update DB with offer details        • Delete offers from eBay        │
│  • Call workflow #4                    • Mark as ended in DB            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow 1: Trading API Import (XML)

**Purpose:** Import active listings created via eBay's legacy Trading API

### Step 1: Build XML Request
```xml
<?xml version="1.0" encoding="utf-8"?>
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <ActiveList>
    <Sort>TimeLeft</Sort>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>
```

### Step 2: Call Trading API
```
POST https://api.ebay.com/ws/api.dll
Headers:
  X-EBAY-API-CALL-NAME: GetMyeBaySelling
  X-EBAY-API-SITEID: 0
  X-EBAY-API-COMPATIBILITY-LEVEL: 967
  X-EBAY-API-IAF-TOKEN: {user_oauth_token}
  Content-Type: text/xml
```

### Step 3: Parse XML Response
Extracts from each `<Item>`:
- `ebay_sku` → from `<SKU>`
- `ebay_item_id` → from `<ItemID>` (CRITICAL for Trading API)
- `title` → from `<Title>`
- `current_price` → from `<CurrentPrice>`
- `quantity_available` → from `<Quantity>`
- `quantity_sold` → from `<QuantitySold>`
- `listing_status` → from `<ListingStatus>`
- `image_url` → from `<GalleryURL>` or `<PictureURL>`
- `ebay_url` → from `<ViewItemURL>`

### Step 4: Upsert to Database
```sql
-- Upsert matching on ebay_item_id
INSERT INTO listings (
  user_id, ebay_sku, ebay_item_id, title, current_price,
  quantity_available, quantity_sold, listing_status,
  image_url, ebay_url, created_at, last_n8n_sync, updated_at,
  enable_auto_reduction, minimum_price, source
) VALUES (...)
ON CONFLICT (ebay_item_id) DO UPDATE SET ...
```

**Key Fields:**
- `source`: `'trading_api'`
- `minimum_price`: `current_price * 0.6` (60% floor)
- `enable_auto_reduction`: `false` (disabled by default)

### Pagination
- Page 1: entries 1-200
- Page 2 (separate workflow): entries 200-400
- Checks `<TotalNumberOfPages>` for more pages

---

## Workflow 2: Inventory API Import

**Purpose:** Import listings created via eBay's modern Inventory API

### Step 1: Paginate Through Inventory Items
```
GET https://api.ebay.com/sell/inventory/v1/inventory_item?limit=1&offset={counter}
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
  "total": 150,
  "next": "..."
}
```

### Step 2: Insert New SKUs
```sql
INSERT INTO listings (
  user_id, ebay_sku, title, quantity_available, source
) VALUES (
  '94e1f3a0-...', 'WI_B0ABC123', 'Product Title', 5, 'inventory_api'
)
```

Note: Initial insert has `current_price = 1.00` as placeholder until offer data is fetched.

### Step 3: Chain to Workflow 3
Calls `2-InventoryAPI-UpdateSkusWithOfferData` to get pricing/offer details.

---

## Workflow 3: Update SKUs with Offer Data

**Purpose:** Fetch offer details (price, listing URL, item ID) for Inventory API listings

### Step 1: Find Incomplete Listings
```sql
SELECT id, ebay_sku FROM listings 
WHERE user_id = '94e1f3a0-...'
  AND current_price = '1.00'  -- placeholder price
  AND ebay_url IS NULL
  AND ebay_item_id IS NULL
```

### Step 2: Get Offer for Each SKU
```
GET https://api.ebay.com/sell/inventory/v1/offer?sku={ebay_sku}
```

Response:
```json
{
  "offers": [{
    "offerId": "123456789",
    "sku": "WI_B0ABC123",
    "listingId": "234567890123",
    "pricingSummary": {
      "price": { "value": "24.99", "currency": "USD" }
    },
    "listing": {
      "listingId": "234567890123"
    }
  }]
}
```

### Step 3: Update Database
```sql
UPDATE listings SET
  ebay_item_id = '234567890123',  -- listingId
  current_price = 24.99,
  ebay_url = 'https://www.ebay.com/itm/234567890123',
  minimum_price = 24.99 * 0.6,
  updated_at = NOW()
WHERE ebay_sku = 'WI_B0ABC123'
```

### Step 4: Chain to Workflow 4
Calls `3-InventoryAPI-DeactivateListings`

---

## Workflow 4: Deactivate Sold Listings

**Purpose:** Clean up ended/sold listings

### Step 1: Find Ended Listings
```sql
SELECT id, ebay_sku, ebay_item_id, listing_status 
FROM listings
WHERE (ebay_item_id IS NULL 
       OR quantity_available = 0 
       OR listing_status = 'Ended')
  AND source = 'inventory_api'
  AND ended_at IS NULL
```

### Step 2: Delete from eBay (optional)
For Inventory API listings:
```
DELETE https://api.ebay.com/sell/inventory/v1/offer/{offerId}
DELETE https://api.ebay.com/sell/inventory/v1/inventory_item/{sku}
```

### Step 3: Mark as Ended in DB
```sql
UPDATE listings SET
  listing_status = 'Ended',
  ended_at = NOW()
WHERE id = '{listing_id}'
```

### Step 4: Chain to Trading API Import
Calls `1-ImporteBayListings Trading API - 1-200` to complete the cycle.

---

## Database Schema Requirements

```sql
-- listings table columns used by import
id UUID PRIMARY KEY,
user_id UUID NOT NULL,
ebay_sku VARCHAR NOT NULL,
ebay_item_id VARCHAR,          -- Trading API ItemID / Inventory API listingId
title VARCHAR NOT NULL,
current_price DECIMAL,
minimum_price DECIMAL,         -- Auto-set to current_price * 0.6
quantity_available INTEGER,
quantity_sold INTEGER,
listing_status VARCHAR,        -- 'Active', 'Ended', 'Sold'
image_url VARCHAR,
ebay_url VARCHAR,
source VARCHAR,                -- 'trading_api' or 'inventory_api'
enable_auto_reduction BOOLEAN DEFAULT false,
last_n8n_sync TIMESTAMP,
last_price_update TIMESTAMP,
ended_at TIMESTAMP,
created_at TIMESTAMP,
updated_at TIMESTAMP
```

---

## Migration Tasks for App

### 1. `sync-ebay-listings.js` (Scheduled Function)
**Replaces:** Workflows 1-3

```javascript
// Pseudo-code
async function syncEbayListings(userId) {
  // Step 1: Import from Trading API (XML)
  const tradingListings = await importTradingApiListings(userId);
  
  // Step 2: Import from Inventory API (REST)
  const inventoryListings = await importInventoryApiListings(userId);
  
  // Step 3: Update offer data for new inventory listings
  await updateOfferData(userId);
  
  return { tradingListings, inventoryListings };
}
```

### 2. `deactivate-ended-listings.js` (Scheduled Function)
**Replaces:** Workflow 4

```javascript
async function deactivateEndedListings(userId) {
  // Find ended listings
  // Optionally delete from eBay
  // Mark as ended in DB
}
```

### 3. Support Both Listing Types for Price Updates
The existing price update logic needs to handle:

| Type | Update Method |
|------|---------------|
| Trading API (`source='trading_api'`) | `ReviseFixedPriceItem` XML |
| Inventory API (`source='inventory_api'`) | `PUT /offer/{offerId}` |

---

## API Endpoints Required

### Trading API (XML)
```
POST https://api.ebay.com/ws/api.dll
X-EBAY-API-CALL-NAME: GetMyeBaySelling
```

### Inventory API (REST)
```
GET /sell/inventory/v1/inventory_item?limit=200&offset=0
GET /sell/inventory/v1/offer?sku={sku}
PUT /sell/inventory/v1/offer/{offerId}
DELETE /sell/inventory/v1/offer/{offerId}
DELETE /sell/inventory/v1/inventory_item/{sku}
```

---

## Key Differences Summary

| Aspect | Trading API | Inventory API |
|--------|-------------|---------------|
| ID Field | `ebay_item_id` (ItemID) | `ebay_sku` → offerId → listingId |
| Import Method | GetMyeBaySelling XML | GET /inventory_item |
| Price Update | ReviseFixedPriceItem XML | PUT /offer/{offerId} |
| Source Value | `'trading_api'` | `'inventory_api'` |
| Has SKU | Maybe | Always |
