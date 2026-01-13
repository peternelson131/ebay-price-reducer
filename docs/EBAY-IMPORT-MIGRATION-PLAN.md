# eBay Import Migration Plan

## Work Breakdown

### Phase 1: Database Alignment ✅ (Mostly Done)
- [x] `listings.ebay_item_id` column (exists)
- [x] `listings.source` column (exists)
- [x] `listings.enable_auto_reduction` column (exists)
- [x] `listings.last_n8n_sync` column (exists)
- [ ] `listings.ended_at` column (need to add)
- [ ] `listings.quantity_sold` column (verify exists)

### Phase 2: Import Functions (New Work)

#### 2A: Trading API Import (`sync-trading-api-listings.js`)
**Effort: Medium**

Tasks:
1. Build `GetMyeBaySelling` XML request
2. Call eBay Trading API with OAuth token
3. Parse XML response (extract items)
4. Upsert to database (match on `ebay_item_id`)
5. Handle pagination (200 items/page)
6. Set `source = 'trading_api'`

Key XML:
```xml
<GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ActiveList>
    <Pagination>
      <EntriesPerPage>200</EntriesPerPage>
      <PageNumber>1</PageNumber>
    </Pagination>
  </ActiveList>
</GetMyeBaySellingRequest>
```

#### 2B: Inventory API Import (`sync-inventory-api-listings.js`)
**Effort: Medium**

Tasks:
1. Call `GET /sell/inventory/v1/inventory_item?limit=200`
2. Insert new SKUs to database
3. For each new SKU, call `GET /sell/inventory/v1/offer?sku={sku}`
4. Update database with offer details (price, listingId)
5. Handle pagination
6. Set `source = 'inventory_api'`

#### 2C: Combined Sync Function (`sync-ebay-listings.js`)
**Effort: Low**

Tasks:
1. Orchestrate Trading API + Inventory API imports
2. Can be triggered manually or scheduled
3. Return sync statistics

### Phase 3: Price Update Support for Both Types

#### 3A: Trading API Price Updates (`update-price-trading-api.js`)
**Effort: Medium**

```xml
<ReviseFixedPriceItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <Item>
    <ItemID>{ebay_item_id}</ItemID>
    <StartPrice>{new_price}</StartPrice>
  </Item>
</ReviseFixedPriceItemRequest>
```

#### 3B: Inventory API Price Updates (Existing)
Already handled by `bulkUpdatePriceQuantity` - just need to route based on `source`.

#### 3C: Update Router (`process-price-reductions.js`)
**Effort: Low**

```javascript
// Pseudo-code
if (listing.source === 'trading_api') {
  await updatePriceTradingApi(listing);
} else {
  await updatePriceInventoryApi(listing);
}
```

### Phase 4: Listing Lifecycle Management

#### 4A: Deactivate Ended Listings (`deactivate-ended-listings.js`)
**Effort: Low**

Tasks:
1. Find listings with `quantity_available = 0` or `listing_status = 'Ended'`
2. Set `ended_at = NOW()`
3. Optionally delete from eBay (Inventory API only)

#### 4B: Auto-Activate Repricing (`activate-repricing.js`)
**Effort: Low**

From n8n workflow:
```sql
UPDATE listings
SET enable_auto_reduction = true
WHERE listing_status = 'Active'
  AND enable_auto_reduction = false
  AND created_at > NOW() - INTERVAL '2 days'
  AND ebay_sku LIKE 'WI_%'
```

---

## Implementation Order

### Sprint 1: Core Import
1. **Trading API Import** - Get XML listings into DB
2. **Inventory API Import** - Get REST listings into DB
3. **Combined Sync** - Single endpoint to sync all

### Sprint 2: Price Updates
4. **Trading API Price Update** - XML ReviseFixedPriceItem
5. **Route by Source** - Update process-price-reductions

### Sprint 3: Lifecycle
6. **Deactivate Ended** - Clean up sold items
7. **Auto-Activate** - Enable repricing for new listings

---

## API Requirements

### Trading API Headers
```
X-EBAY-API-CALL-NAME: GetMyeBaySelling | ReviseFixedPriceItem
X-EBAY-API-SITEID: 0
X-EBAY-API-COMPATIBILITY-LEVEL: 967
X-EBAY-API-IAF-TOKEN: {user_oauth_token}
Content-Type: text/xml
```

### Inventory API Endpoints
```
GET  /sell/inventory/v1/inventory_item?limit=200
GET  /sell/inventory/v1/offer?sku={sku}
PUT  /sell/inventory/v1/offer/{offerId}
POST /sell/inventory/v1/bulk_update_price_quantity
```

---

## Environment Considerations

Both Trading API and Inventory API need sandbox support:
- Production: `api.ebay.com`
- Sandbox: `api.sandbox.ebay.com`

The `IS_SANDBOX` pattern we established tonight should be applied to all new functions.

---

## Estimated LOE

| Task | Effort | Notes |
|------|--------|-------|
| Trading API Import | 4-6 hrs | XML parsing, pagination |
| Inventory API Import | 3-4 hrs | REST, simpler than XML |
| Combined Sync | 1-2 hrs | Orchestration only |
| Trading API Price Update | 3-4 hrs | XML, error handling |
| Route by Source | 1 hr | Simple if/else |
| Deactivate Ended | 2 hrs | DB queries |
| Auto-Activate | 1 hr | DB query |
| **Total** | **15-20 hrs** | |
