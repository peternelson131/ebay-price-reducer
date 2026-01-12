# eBay API - Business Notes & Concepts

> Strategic reference for eBay API decision-making - January 2026

## API Philosophy: REST vs Legacy

| Type | Format | Status | Recommendation |
|------|--------|--------|----------------|
| **RESTful APIs** | JSON/REST | Current | ✅ Use for new development |
| **Traditional APIs** | XML/SOAP | Legacy | ⚠️ Migrate away |

**Key insight:** eBay is actively pushing developers from Trading API (XML) to Inventory API (REST). The Inventory API has **400x higher rate limits** (2M vs 5K/day).

---

## API Families at a Glance

### Seller APIs (what we use most)
| API | What It Does | When to Use |
|-----|--------------|-------------|
| **Inventory API** | Listings, prices, quantities | Price reducer, listing management |
| **Fulfillment API** | Orders, shipping, refunds | Order processing |
| **Account API** | Business policies, settings | Setup, configuration |
| **Analytics API** | Performance metrics | Dashboards, monitoring |
| **Feed API** | Bulk file operations | Large-scale exports/imports |
| **Marketing API** | Promoted Listings, promotions | Advertising tools |

### Support APIs
| API | What It Does |
|-----|--------------|
| **Taxonomy API** | Category tree, required item aspects |
| **Browse API** | Search eBay listings (buyer view) |
| **Catalog API** | Product catalog lookups |
| **Media API** | Image/video uploads |

---

## Rate Limits - Capacity Planning

### High-Throughput Operations (Inventory API = 2M/day)

The Inventory API is the **workhorse** - designed for high-volume sellers.

| Scenario | Calls Needed | Feasible? |
|----------|--------------|-----------|
| Update 10,000 prices | 400 calls (25/batch) | ✅ Easy |
| Update 100,000 prices | 4,000 calls | ✅ Easy |
| Update 1,000,000 prices | 40,000 calls | ✅ No problem |
| Update 50,000,000 prices | 2,000,000 calls | ✅ At the limit |

**Price Reducer math:**
- `bulkUpdatePriceQuantity` = 25 items per call
- 2M calls/day ÷ 25 = **50 million price updates/day** max
- For a 10,000 item store updating daily: only 400 API calls

### Limited APIs (Plan Accordingly)

| API | Daily Limit | Impact |
|-----|-------------|--------|
| **Analytics API** | 100-400/day | Can't poll frequently - cache results |
| **Browse API** | 5,000/day | Rate-limited for search features |
| **Trading API** | 5,000/day | Avoid for bulk operations |
| **Compliance API** | 5,000/day | Check periodically, not constantly |

### Rate Limit Strategy

1. **Bulk APIs first** - Always use batch methods when available
2. **Cache metadata** - Taxonomy, categories rarely change
3. **Webhooks over polling** - Use Notification API for real-time updates
4. **Stagger operations** - Spread across the day if approaching limits

---

## Use Case → API Mapping

### Price Reducer Tool ⭐

| Step | API | Method | Why |
|------|-----|--------|-----|
| Get current prices | Inventory API | `bulkGetInventoryItem` | 25 items/call |
| Update prices | Inventory API | `bulkUpdatePriceQuantity` | 25 items/call, 2M/day |

**NOT recommended:**
- Trading API `ReviseInventoryStatus` - Only 5K calls/day, XML format
- Individual `updateOffer` calls - No batching

### Listing Creation

| Need | API Path |
|------|----------|
| Create listing | Inventory API: inventory item → offer → publish |
| Bulk create | Inventory API: bulk methods (25 each step) |
| Massive bulk | Feed API: upload file |

### Order Management

| Need | API | Notes |
|------|-----|-------|
| Fetch orders | Fulfillment API | Filter by date, status |
| Add tracking | Fulfillment API | Per-shipment |
| Bulk export | Feed API | For large order volumes |

### Inventory Sync

| Need | Approach |
|------|----------|
| Full export | Feed API `createInventoryTask` |
| Real-time sync | Notification API webhooks |
| Spot checks | Inventory API `bulkGetInventoryItem` |

---

## Migration Strategy: Trading → Inventory API

### Why Migrate?

| Factor | Trading API | Inventory API |
|--------|-------------|---------------|
| Rate limit | 5K/day | **2M/day** |
| Format | XML 😬 | JSON ✅ |
| Batch size | 5 items | 25 items |
| Future support | Declining | Primary focus |

### Migration Path

1. **Convert existing listings** using `bulkMigrateListing`
2. **New development** on Inventory API only
3. **Price updates** via `bulkUpdatePriceQuantity` (not `ReviseInventoryStatus`)

### What Still Needs Trading API
- Some legacy metadata calls
- Certain niche features not yet in REST
- Old integrations during transition

---

## Cost Considerations

### API Calls = Free
eBay doesn't charge per API call (unlike some platforms).

### Where Costs Come From
- **eBay fees** on sales (separate from API)
- **Development time** - REST is faster to develop
- **Infrastructure** - Your servers making the calls

### Efficiency = Speed
More efficient API usage means:
- Faster price updates
- Quicker inventory sync
- Better competitive positioning

---

## Strategic Recommendations

### For Price Reducer App

1. **Use Inventory API exclusively** for price/quantity updates
2. **Batch everything** - 25 items per call
3. **Schedule wisely** - Update during off-peak if approaching limits
4. **Monitor rate limit headers** - `X-EBAY-API-CALL-USAGE`

### For Future Features

| Feature | Recommended API |
|---------|-----------------|
| Order dashboard | Fulfillment API |
| Inventory sync | Inventory API + Feed API for exports |
| Competitive pricing | Browse API (limited) + Keepa |
| Performance metrics | Analytics API (cache results) |
| Promoted Listings | Marketing API |

### Don't Build On

- Trading API for new features (migrate away)
- Polling when webhooks available
- Single-item calls when bulk exists

---

## Quick Decision Tree

```
Need to update prices?
  └─> How many items?
        └─> 1-25: Inventory API bulkUpdatePriceQuantity
        └─> 26-10,000: Loop bulkUpdatePriceQuantity
        └─> 10,000+: Consider Feed API for efficiency

Need order data?
  └─> Real-time: Fulfillment API getOrders
  └─> Bulk export: Feed API createOrderTask
  └─> Notifications: Notification API webhooks

Need listing data?
  └─> Your listings: Inventory API
  └─> Any listings: Browse API (limited)
  └─> Product catalog: Catalog API
```

---

## Summary: The 80/20

**80% of what you need:**
- **Inventory API** - Listings, prices, quantities (2M/day)
- **Fulfillment API** - Orders and shipping (100K/day)
- **Account API** - Business policies (setup)

**The key insight:**
`bulkUpdatePriceQuantity` with 25 items/call and 2M calls/day limit = virtually unlimited capacity for any reasonable seller volume.

---

*See EBAY-API-TECHNICAL.md for implementation details, endpoints, and code patterns.*
