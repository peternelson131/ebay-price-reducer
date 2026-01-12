# Keepa API - Business Guide

> A strategic guide for resellers and arbitrage businesses using Keepa's Amazon product data API.

## What Keepa Provides

Keepa is the most comprehensive source for Amazon historical data, tracking **4+ billion products** across all major marketplaces. Unlike other services that provide snapshots, Keepa maintains complete historical records.

### Data Categories

| Category | Description | Use Case |
|----------|-------------|----------|
| **Price History** | Amazon, New, Used, FBA, Buy Box prices over time | Track pricing trends, identify price manipulation |
| **Sales Rank** | Historical BSR for main category + sub-categories | Estimate sales velocity, seasonality |
| **Offer Counts** | New/Used seller count over time | Competition analysis, market saturation |
| **Buy Box Data** | Who held Buy Box, for how long, at what price | Competitive positioning, repricing strategy |
| **Product Details** | Title, brand, dimensions, weight, categories | Sourcing research, FBA fee estimation |
| **Seller Data** | Seller ratings, storefront listings | Competitor intelligence |
| **Deals & Lightning Deals** | Current and upcoming deals | Promotional awareness |

## Use Cases for Arbitrage/Reselling

### 1. Competition Analysis (Pete's Key Metric)
Track **offer count trends** to identify opportunities:
- **Declining sellers** → Less competition, better Buy Box chances
- **Stable low count** (<10 sellers) → Sustainable market position
- **Rapidly increasing** → Warning sign, market becoming saturated

### 2. Price History Analysis
- Identify **price floors** (lowest historical prices)
- Detect **seasonal patterns** for timing purchases
- Spot **price manipulation** (artificial spikes before drops)
- Calculate **true average selling price** vs. MSRPs

### 3. Sales Velocity Estimation
Use sales rank history to:
- Estimate units sold per day/month
- Identify **seasonal products** (rank spikes during holidays)
- Compare rank stability across variations

### 4. Sourcing Research
Use Product Finder to:
- Find products matching profitability criteria
- Identify ungated categories with low competition
- Filter by FBA fees, dimensions, weight

### 5. Buy Box Analysis
- See which sellers hold Buy Box (and for how long)
- Identify if Amazon dominates (avoid or match)
- Track FBA vs. FBM Buy Box share

---

## Token Costs Per API Call Type

Keepa uses a **token-based** system (not traditional rate limits). Tokens refill continuously based on your plan.

### Token Cost Summary

| Endpoint | Token Cost | Notes |
|----------|-----------|-------|
| **Product Request** | 1 per ASIN | Basic product data |
| + `offers` parameter | +6 per 10 offers | Live marketplace offers |
| + `buybox` parameter | +2 per ASIN | Buy Box history |
| + `stock` parameter | +2 per ASIN | Inventory levels |
| + `rating` parameter | +1 per ASIN | Rating/review history |
| + `update=0` (force refresh) | +1 per ASIN | When data is <1 hour old |
| **Product Finder** | 10 + 1 per 100 ASINs | Bulk ASIN discovery |
| + Search Insights | +30 + 1 per 1M results | Aggregated analytics |
| **Product Search** | 10 per page | Keyword search (10 results/page) |
| **Category Lookup** | 1 per category | Category tree data |
| **Category Search** | 1 per search | Find categories by name |
| **Deals** | 5 per 150 deals | Current deals |
| **Best Sellers** | 50 per list | Up to 100,000 ASINs |
| **Seller Info** | 1 per seller | Seller details |
| **Most Rated Sellers** | 50 per list | Top seller lists |

### Batch Efficiency
- **Product requests** can batch up to **100 ASINs** per call (still 1 token each)
- **Product Finder** returns up to **10,000 ASINs** per query (10 + 100 tokens max)

---

## Pricing Plans

All plans are **monthly subscriptions** with tokens regenerating continuously.

| Plan | Tokens/Min | Tokens/Month | Price | Per Token |
|------|-----------|--------------|-------|-----------|
| 20 | 20 | 892,800 | €49 | €0.000055 |
| 60 | 60 | 2,678,400 | €129 | €0.000048 |
| 250 | 250 | 11,160,000 | €459 | €0.000041 |
| 500 | 500 | 22,320,000 | €879 | €0.000039 |
| 1000 | 1,000 | 44,640,000 | €1,499 | €0.000034 |

**Token Bucket System:**
- Tokens accumulate up to 60 minutes of capacity
- Example: 60 tokens/min plan = max 3,600 token bucket
- Allows burst usage while maintaining average rate

---

## Which Endpoints to Use for Different Business Needs

### Scenario: Daily Price Monitoring (Existing Inventory)

**Recommended:** Product Request with minimal parameters

```
/product?key=KEY&domain=1&asin=ASIN1,ASIN2,...&stats=180&history=0
```

| Parameter | Reason |
|-----------|--------|
| `stats=180` | Get calculated stats without parsing history |
| `history=0` | Skip raw CSV data, reduce response size |

**Token Cost:** 1 per ASIN (batch 100 at a time)

### Scenario: Deep Dive on Specific Product

**Recommended:** Full product request with offers

```
/product?key=KEY&domain=1&asin=B00XXXX&stats=180&offers=20&buybox=1
```

**Token Cost:** 1 (base) + 6-12 (offers) + 2 (buybox) = ~9-15 tokens

### Scenario: Finding New Products to Source

**Recommended:** Product Finder API

```json
{
  "rootCategory": 3760911,
  "current_SALES_lte": 100000,
  "current_COUNT_NEW_lte": 15,
  "current_BUY_BOX_SHIPPING_gte": 1500,
  "buyBoxIsAmazon": false,
  "perPage": 1000
}
```

**Token Cost:** 10 + 10 (for 1000 results) = 20 tokens

### Scenario: Competition Monitoring on Competitor's Listings

**Recommended:** Product Request batches

- Batch competitor ASINs (from their storefront or manual list)
- Request with `offers` parameter to see all sellers

### Scenario: Category Research

**Recommended:** Category endpoints + Product Finder

1. Use **Category Lookup** to get category tree (1 token)
2. Use **Product Finder** with category filters (10+ tokens)

---

## Data Freshness & Update Frequencies

| Data Type | Update Frequency | Notes |
|-----------|-----------------|-------|
| **Product prices** | ~1 hour | Automatically refreshed if >1 hour old |
| **Sales rank** | ~1 hour | Updates with price checks |
| **Offer count** | ~1 hour | Basic counts with price data |
| **Marketplace offers** | On-demand | Requires `offers` parameter, 2-20 sec |
| **Buy Box history** | On-demand | Requires `offers` or `buybox` parameter |
| **Rating/Reviews** | Irregular | Updated with offers, may be days old |
| **eBay prices** | Variable | Less frequent, use with caution |
| **Stock levels** | On-demand | Requires `stock` parameter |

### Forcing Fresh Data
- Use `update=0` to force refresh (adds 1 token if data is <1 hour old)
- Use `update=-1` to skip update entirely (0 tokens if product not in DB)
- Use `offers` parameter for real-time marketplace data

---

## Strategic Recommendations for Efficient Token Usage

### 1. Batch Aggressively
- Always batch 100 ASINs per product request
- Use Product Finder instead of individual searches

### 2. Use Stats, Not Raw History
```
stats=180  # Get calculated averages
history=0  # Skip CSV data
```
This gives you current prices, 30/90/180-day averages, min/max without parsing.

### 3. Tiered Monitoring Approach

| Tier | Check Frequency | What to Include |
|------|----------------|-----------------|
| Hot (active listings) | 2-4x daily | `stats=30`, minimal |
| Warm (watchlist) | 1x daily | `stats=90` |
| Cold (research) | Weekly | Full data with `offers` |

### 4. Cache Responses
- Product data doesn't change dramatically in minutes
- Cache for 30-60 minutes to reduce redundant calls
- Store historical data locally after first fetch

### 5. Use Product Finder for Discovery
Instead of:
- Searching each ASIN individually (10 tokens each)

Do:
- One Product Finder query with filters (10 + X tokens total)

### 6. Monitor Your Token Balance
```javascript
// Check before large operations
const { tokensLeft, refillIn } = await getTokenBalance()
if (tokensLeft < requiredTokens) {
  // Wait or reduce batch size
}
```

---

## When to Use Keepa vs. Other Data Sources

| Need | Best Source | Why |
|------|-------------|-----|
| **Amazon historical prices** | Keepa | Most comprehensive, years of data |
| **Real-time price** | Amazon API (SP-API) | Authoritative, live |
| **Estimated sales** | Keepa (sales rank history) | Track rank patterns over time |
| **Exact sales numbers** | Amazon Brand Analytics | If you have brand access |
| **FBA fees** | Amazon FBA Calculator | Official, current fees |
| **Product discovery** | Keepa Product Finder | Powerful filters on historical data |
| **Supplier pricing** | Direct from suppliers | Keepa = retail prices only |
| **UPC/EAN lookup** | Keepa | Can lookup by product codes |

### Keepa Strengths
- Unmatched **historical depth** (10+ years for some products)
- **Offer count history** (critical for competition analysis)
- **Buy Box history** with seller identification
- **Product Finder** with 100+ filter criteria
- **Batch efficiency** (100 ASINs/request)

### Keepa Limitations
- **No live inventory levels** without `stock` parameter (adds cost)
- **No profitability calculation** (no COGS data)
- **eBay data less reliable** (use with caution)
- **Rating data may be stale** (updated irregularly)

---

## Cost Optimization Examples

### Example 1: Daily Monitoring of 1,000 SKUs

**Naive approach:** 1,000 individual requests
- 1,000 tokens × 4 checks/day = 4,000 tokens/day
- 120,000 tokens/month

**Optimized approach:** Batch requests
- 10 batches of 100 ASINs × 4 checks/day = 40 requests/day
- 40 × 100 = 4,000 tokens/day (same, but faster)
- Add `history=0` to reduce bandwidth

**Best approach:** Tiered monitoring
- Hot 200 SKUs: 4x/day = 800 × 4 = 3,200 tokens
- Warm 500 SKUs: 1x/day = 500 tokens  
- Cold 300 SKUs: 2x/week = 86 tokens/day avg
- **Total: ~3,786 tokens/day = 113,580/month**

**Plan needed:** 60 tokens/min (2.6M/month) - €129/month

### Example 2: Product Research Session

**Goal:** Find 50 products to source in Electronics category

**Approach:**
1. Product Finder query: 10 + 10 tokens = 20 tokens
2. Deep dive on 50 products with offers: 50 × 15 = 750 tokens
3. **Total: 770 tokens** (< 15 minutes of 60/min plan)

---

## Key Metrics for Arbitrage Decision-Making

### From Keepa Data, Calculate:

| Metric | How to Get It | Decision Impact |
|--------|--------------|-----------------|
| **Offer Count Trend** | Compare `current[11]` to `avg30[11]` | Declining = opportunity |
| **Price Stability** | Compare `current[0]` to `avg90[0]` | Stable = predictable margin |
| **Amazon Presence** | Check `availabilityAmazon` field | -1 = no Amazon offer |
| **Buy Box Ownership** | `buyBoxSellerIdHistory` | Amazon dominance? |
| **Sales Velocity** | Rank changes in `csv[3]` | Frequency of rank drops |
| **Competition Level** | `current[11]` offer count | <10 = low, >50 = high |

---

## Summary: Getting Started

1. **Start with €49/month plan** (20 tokens/min = 892K/month)
2. **Batch all requests** (100 ASINs max)
3. **Use `stats` parameter** instead of parsing CSV
4. **Implement caching** for frequently accessed data
5. **Use Product Finder** for discovery, not individual searches
6. **Monitor token balance** before large operations
7. **Upgrade when** you consistently run low on tokens

---

## Related Documentation

- **Technical Reference:** [KEEPA-API-TECHNICAL.md](./KEEPA-API-TECHNICAL.md)
- **Official Docs:** https://keepa.com/#!discuss/t/how-our-api-plans-work/410
- **Product Object:** https://discuss.keepa.com/t/product-object/116
- **Product Finder:** https://discuss.keepa.com/t/product-finder/5473
