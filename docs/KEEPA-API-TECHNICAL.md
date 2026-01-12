# Keepa API - Technical Reference

> Complete technical documentation for integrating with the Keepa API.

## Base URL & Authentication

```
https://api.keepa.com
```

**Authentication:** API key passed as query parameter `key`

```typescript
const KEEPA_API = 'https://api.keepa.com'
const API_KEY = process.env.KEEPA_API_KEY
```

---

## Important: Response Handling

Keepa responses are **gzip-compressed** by default. You must handle decompression:

```typescript
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'

const gunzipAsync = promisify(gunzip)

async function keepaFetch(url: string): Promise<any> {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  
  try {
    const decompressed = await gunzipAsync(Buffer.from(buffer))
    return JSON.parse(decompressed.toString())
  } catch {
    // Not compressed (error responses)
    return JSON.parse(Buffer.from(buffer).toString())
  }
}
```

---

## API Endpoints

### 1. Product Request

**Endpoint:** `GET /product`

**Token Cost:** 1 per ASIN (+ additional for optional parameters)

#### Required Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace (see Domain IDs) |
| `asin` | String | Single ASIN or comma-separated list (max 100) |

#### Alternative: Product Code Lookup

| Parameter | Type | Description |
|-----------|------|-------------|
| `code` | String | UPC, EAN, or ISBN-13 (max 100 comma-separated) |
| `code-limit` | Integer | Max products per code (optional) |

#### Optional Parameters

| Parameter | Type | Token Cost | Description |
|-----------|------|------------|-------------|
| `stats` | String | 0 | Include statistics. Values: `X` (last X days) or `date1,date2` |
| `offers` | Integer (20-100) | 6 per 10 offers | Fetch live marketplace offers |
| `buybox` | Boolean (0/1) | 2 | Include Buy Box history |
| `stock` | Boolean (0/1) | 2 | Include stock levels (requires `offers`) |
| `rating` | Boolean (0/1) | 0-1 | Include rating history |
| `update` | Integer | 0-1 | Force refresh. `-1`=never, `0`=always, `X`=if older than X hours |
| `history` | Boolean (0/1) | 0 | Set to `0` to exclude CSV history |
| `days` | Integer | 0 | Limit history to last X days |
| `only-live-offers` | Boolean (0/1) | 0 | Exclude historical offers |
| `rental` | Boolean (0/1) | 0 | Include rental prices (US books only) |
| `videos` | Boolean (0/1) | 0 | Include video metadata |
| `aplus` | Boolean (0/1) | 0 | Include A+ content |
| `historical-variations` | Boolean (0/1) | 1 | Include out-of-stock variations |

#### Example Request

```typescript
async function getProduct(asin: string, options: {
  domain?: number
  stats?: string
  offers?: number
  buybox?: boolean
} = {}) {
  const params = new URLSearchParams({
    key: API_KEY,
    domain: (options.domain || 1).toString(),
    asin,
  })
  
  if (options.stats) params.set('stats', options.stats)
  if (options.offers) params.set('offers', options.offers.toString())
  if (options.buybox) params.set('buybox', '1')
  
  return keepaFetch(`${KEEPA_API}/product?${params}`)
}

// Usage
const result = await getProduct('B00XXXX', { 
  stats: '180', 
  offers: 20 
})
const product = result.products[0]
```

#### Response Structure

```typescript
interface ProductResponse {
  timestamp: number
  tokensLeft: number
  refillIn: number
  refillRate: number
  tokenFlowReduction: number
  tokensConsumed: number
  products: Product[]
}
```

---

### 2. Product Finder (Query)

**Endpoint:** `GET /query` or `POST /query`

**Token Cost:** 10 + 1 per 100 ASINs in results

#### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `selection` | JSON String (GET) / Body (POST) | Query filters |
| `stats` | Boolean (0/1) | Include Search Insights (+30 tokens) |

#### Query JSON Structure

```typescript
interface ProductFinderQuery {
  // Paging
  page?: number           // Default 0, for pagination
  perPage?: number        // Default/min 50, max 10,000 on page 0
  
  // Sorting
  sort?: [string, 'asc' | 'desc'][]  // Up to 3 criteria
  
  // Category filters
  rootCategory?: number[]
  categories_include?: number[]
  categories_exclude?: number[]
  salesRankReference?: number
  
  // Product attributes
  title?: string                    // Keyword search
  manufacturer?: string[]
  brand?: string[]
  productGroup?: string[]
  productType?: number              // 0=standard, 1=downloadable, 2=ebook, 5=variation parent
  hasParentASIN?: boolean
  singleVariation?: boolean
  
  // Price filters (in cents)
  current_AMAZON_lte?: number
  current_AMAZON_gte?: number
  current_NEW_lte?: number
  current_NEW_gte?: number
  current_BUY_BOX_SHIPPING_lte?: number
  current_BUY_BOX_SHIPPING_gte?: number
  
  // Competition filters
  current_COUNT_NEW_lte?: number
  current_COUNT_NEW_gte?: number
  current_COUNT_USED_lte?: number
  current_COUNT_USED_gte?: number
  
  // Sales rank
  current_SALES_lte?: number
  current_SALES_gte?: number
  avg90_SALES_lte?: number
  avg90_SALES_gte?: number
  
  // Buy Box filters
  buyBoxIsAmazon?: boolean
  buyBoxIsFBA?: boolean
  buyBoxSellerId?: string[]
  
  // Delta filters (price changes)
  delta30_AMAZON_lte?: number       // Price dropped by at least X cents
  delta30_AMAZON_gte?: number       // Price increased by at least X cents
  deltaPercent30_AMAZON_lte?: number
  deltaPercent30_AMAZON_gte?: number
  
  // Historical filters
  isLowest_BUY_BOX_SHIPPING?: boolean  // At all-time low
  isLowest90_BUY_BOX_SHIPPING?: boolean // At 90-day low
  backInStock_AMAZON?: boolean
  
  // Dimensions (millimeters / grams)
  packageWeight_lte?: number
  packageWeight_gte?: number
  itemWeight_lte?: number
  
  // Other
  hasReviews?: boolean
  current_RATING_gte?: number       // 0-50 (4.5 stars = 45)
  monthlySold_gte?: number          // "Bought X times in past month"
  isSNS?: boolean                   // Subscribe & Save
  isHazMat?: boolean
  isAdultProduct?: boolean
}
```

#### Example: Find Low-Competition Products

```typescript
async function findLowCompetitionProducts(category: number) {
  const query: ProductFinderQuery = {
    rootCategory: [category],
    current_SALES_lte: 100000,         // Top 100K rank
    current_COUNT_NEW_lte: 15,         // Max 15 sellers
    current_BUY_BOX_SHIPPING_gte: 1500, // Min $15 Buy Box
    buyBoxIsAmazon: false,             // Amazon not in Buy Box
    current_RATING_gte: 40,            // 4+ stars
    perPage: 500,
    sort: [['current_SALES', 'asc']],  // Best sellers first
  }
  
  const params = new URLSearchParams({
    key: API_KEY,
    domain: '1',
    selection: JSON.stringify(query),
  })
  
  const result = await keepaFetch(`${KEEPA_API}/query?${params}`)
  return result.asinList  // Array of ASINs
}
```

#### Response Structure

```typescript
interface QueryResponse {
  asinList: string[]
  totalResults: number
  searchInsights?: SearchInsightsObject  // If stats=1
}
```

---

### 3. Product Search

**Endpoint:** `GET /search`

**Token Cost:** 10 per page (10 results per page)

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `type` | String | `product`, `author`, `title`, `asin`, `upc`, `ean` |
| `term` | String | Search term (URL encoded) |
| `page` | Integer | Page number (0-indexed) |

```typescript
async function searchProducts(term: string, domain = 1) {
  const params = new URLSearchParams({
    key: API_KEY,
    domain: domain.toString(),
    type: 'product',
    term,
  })
  
  return keepaFetch(`${KEEPA_API}/search?${params}`)
}
```

---

### 4. Category Endpoints

#### Category Lookup

**Endpoint:** `GET /category`

**Token Cost:** 1 per category

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `category` | Long | Category node ID |
| `parents` | Boolean (0/1) | Include parent tree (+1 token) |

#### Category Search

**Endpoint:** `GET /categorytree`

**Token Cost:** 1 per search

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `term` | String | Search term |

---

### 5. Deals

**Endpoint:** `GET /deals`

**Token Cost:** 5 per 150 deals

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `selection` | JSON | Deal filters (categories, price ranges, etc.) |

---

### 6. Best Sellers

**Endpoint:** `GET /bestsellers`

**Token Cost:** 50 per list (up to 100,000 ASINs)

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `category` | Long | Category node ID |

---

### 7. Seller Information

**Endpoint:** `GET /seller`

**Token Cost:** 1 per seller

| Parameter | Type | Description |
|-----------|------|-------------|
| `key` | String | Your API key |
| `domain` | Integer | Amazon marketplace |
| `seller` | String | Seller ID (comma-separated for batch) |

---

### 8. Token Status

**Endpoint:** `GET /token`

**Token Cost:** 0

```typescript
async function getTokenStatus() {
  const params = new URLSearchParams({ key: API_KEY })
  return keepaFetch(`${KEEPA_API}/token?${params}`)
}

// Response
interface TokenResponse {
  timestamp: number
  tokensLeft: number
  refillIn: number      // Minutes until next refill
  refillRate: number    // Tokens per minute
}
```

---

## Domain IDs

| ID | Marketplace | Currency |
|----|-------------|----------|
| 1 | amazon.com (US) | USD (cents) |
| 2 | amazon.co.uk (UK) | GBP (pence) |
| 3 | amazon.de (Germany) | EUR (cents) |
| 4 | amazon.fr (France) | EUR (cents) |
| 5 | amazon.co.jp (Japan) | JPY |
| 6 | amazon.ca (Canada) | CAD (cents) |
| 8 | amazon.it (Italy) | EUR (cents) |
| 9 | amazon.es (Spain) | EUR (cents) |
| 10 | amazon.in (India) | INR (paise) |
| 11 | amazon.com.mx (Mexico) | MXN (centavos) |
| 12 | amazon.com.br (Brazil) | BRL (centavos) |

---

## Product Object

### Core Fields

```typescript
interface Product {
  productType: number        // 0=standard, 1=downloadable, 2=ebook, 3=inaccessible, 4=invalid, 5=variation parent
  asin: string
  domainId: number
  title: string
  
  // Timestamps (Keepa Time minutes)
  trackingSince: number
  listedSince: number
  lastUpdate: number
  lastRatingUpdate: number
  lastPriceChange: number
  
  // Category
  rootCategory: number
  categories: number[]
  categoryTree: { catId: number, name: string }[]
  salesRankReference: number
  
  // Identifiers
  parentAsin?: string
  eanList?: string[]
  upcList?: string[]
  
  // Product details
  manufacturer?: string
  brand?: string
  model?: string
  color?: string
  size?: string
  
  // Dimensions (millimeters / grams)
  packageHeight: number
  packageLength: number
  packageWidth: number
  packageWeight: number
  itemHeight: number
  itemLength: number
  itemWidth: number
  itemWeight: number
  
  // Availability
  availabilityAmazon: number   // -1=none, 0=in stock, 1=preorder, 2=unknown, 3=backorder, 4=delayed
  
  // Fees
  fbaFees?: {
    lastUpdate: number
    pickAndPackFee: number
  }
  referralFeePercentage: number
  
  // History data
  csv: (number[] | null)[]     // Price/value histories
  salesRanks: { [categoryId: string]: number[] }
  
  // Optional (with offers param)
  offers?: MarketplaceOffer[]
  liveOffersOrder?: number[]
  buyBoxSellerIdHistory?: string[]
  buyBoxUsedHistory?: string[]
  
  // Statistics (with stats param)
  stats?: StatisticsObject
}
```

### Statistics Object

```typescript
interface StatisticsObject {
  current: number[]           // Current values
  avg: number[]               // Average over requested period
  avg30: number[]
  avg90: number[]
  avg180: number[]
  avg365: number[]
  atIntervalStart: number[]
  minInInterval: number[][]   // [value, keepaTime]
  maxInInterval: number[][]   // [value, keepaTime]
  outOfStockPercentage: number[]  // [30-day, 90-day]
  
  // Buy Box statistics (with offers/buybox param)
  buyBoxPrice: number
  buyBoxShipping: number
  buyBoxIsAmazon: boolean
  buyBoxIsFBA: boolean
  buyBoxIsPreorder: boolean
  buyBoxIsBackorder: boolean
  buyBoxMinOrderQuantity: number
  buyBoxMaxOrderQuantity: number
  buyBoxSellerId: string
  buyBoxUsedPrice: number
  buyBoxUsedShipping: number
  buyBoxUsedCondition: number
  buyBoxUsedIsFBA: boolean
  buyBoxUsedSellerId: string
}
```

### Marketplace Offer Object

```typescript
interface MarketplaceOffer {
  offerId: number
  sellerId: string
  condition: number           // 0-5 (see conditions below)
  conditionComment?: string
  
  isPrime: boolean
  isFBA: boolean
  isShippable: boolean
  isAddonItem: boolean
  isPreorder: boolean
  isWarehouseDeal: boolean
  isScam: boolean
  isSNS: boolean
  isPrimeExclusive: boolean
  
  lastSeen: number            // Keepa Time minutes
  
  offerCSV: number[]          // [time, price, shipping, time, ...]
  stockCSV?: number[]         // Stock history (with stock param)
}
```

### Condition Codes

| Code | Condition |
|------|-----------|
| 0 | Unknown |
| 1 | New |
| 2 | Used - Like New |
| 3 | Used - Very Good |
| 4 | Used - Good |
| 5 | Used - Acceptable |

---

## CSV (Price History) Array Format

The `csv` field contains price history arrays. Each index represents a different data type:

### CSV Index Reference

| Index | Name | Description | Value Format |
|-------|------|-------------|--------------|
| 0 | AMAZON | Amazon price | cents |
| 1 | NEW | Marketplace new (lowest) | cents |
| 2 | USED | Marketplace used (lowest) | cents |
| 3 | SALES | Sales rank | integer |
| 4 | LISTPRICE | MSRP | cents |
| 5 | COLLECTIBLE | Collectible price | cents |
| 6 | REFURBISHED | Refurbished price | cents |
| 7 | NEW_FBM_SHIPPING | New FBM + shipping | cents |
| 8 | LIGHTNING_DEAL | Lightning deal price | cents |
| 9 | WAREHOUSE | Warehouse deals price | cents |
| 10 | NEW_FBA | Lowest FBA (non-Amazon) | cents |
| 11 | COUNT_NEW | New offer count | integer |
| 12 | COUNT_USED | Used offer count | integer |
| 13 | COUNT_REFURBISHED | Refurbished count | integer |
| 14 | COUNT_COLLECTIBLE | Collectible count | integer |
| 15 | EXTRA_INFO_UPDATES | Offers update history | integer |
| 16 | RATING | Product rating | 0-50 (4.5★ = 45) |
| 17 | COUNT_REVIEWS | Review count | integer |
| 18 | BUY_BOX_SHIPPING | Buy Box price + shipping | cents |
| 19-22 | USED_*_SHIPPING | Used sub-conditions | cents |
| 23-26 | COLLECTIBLE_*_SHIPPING | Collectible sub-conditions | cents |
| 27 | REFURBISHED_SHIPPING | Refurbished + shipping | cents |
| 28 | EBAY_NEW_SHIPPING | eBay new price | cents |
| 29 | EBAY_USED_SHIPPING | eBay used price | cents |
| 30 | TRADE_IN | Trade-in value | cents |
| 31 | RENTAL | Rental price | cents |
| 32 | BUY_BOX_USED_SHIPPING | Used Buy Box | cents |
| 33 | PRIME_EXCL | Prime Exclusive price | cents |

### Parsing CSV Arrays

```typescript
// Standard format: [time, value, time, value, ...]
function parseHistory(csv: number[]): Array<{ date: Date; value: number }> {
  const history = []
  for (let i = 0; i < csv.length; i += 2) {
    const keepaTime = csv[i]
    const value = csv[i + 1]
    if (value !== -1) {  // -1 = no data
      history.push({
        date: keepaTimeToDate(keepaTime),
        value,
      })
    }
  }
  return history
}

// Shipping format: [time, price, shipping, time, price, shipping, ...]
function parseShippingHistory(csv: number[]): Array<{ 
  date: Date
  price: number
  shipping: number 
}> {
  const history = []
  for (let i = 0; i < csv.length; i += 3) {
    const keepaTime = csv[i]
    const price = csv[i + 1]
    const shipping = csv[i + 2]
    if (price !== -1) {
      history.push({
        date: keepaTimeToDate(keepaTime),
        price: price / 100,
        shipping: shipping / 100,
      })
    }
  }
  return history
}
```

---

## Keepa Time Format

Keepa uses a custom time format: **minutes since January 1, 2011 UTC**.

```typescript
const KEEPA_EPOCH = new Date('2011-01-01T00:00:00Z').getTime()

function keepaTimeToDate(keepaMinutes: number): Date {
  return new Date(KEEPA_EPOCH + keepaMinutes * 60 * 1000)
}

function dateToKeepaTime(date: Date): number {
  return Math.floor((date.getTime() - KEEPA_EPOCH) / (60 * 1000))
}

// Alternative using the documented formula:
function keepaToUnixMs(keepaTime: number): number {
  return (keepaTime + 21564000) * 60000
}

function keepaToUnixSec(keepaTime: number): number {
  return (keepaTime + 21564000) * 60
}
```

---

## Error Handling

### Response Errors

```typescript
interface ErrorResponse {
  error?: {
    type: string
    message: string
  }
  tokensLeft?: number
}
```

### Common Error Types

| Error Type | Description | Solution |
|------------|-------------|----------|
| `INVALID_KEY` | Invalid API key | Check key is correct |
| `NOT_ENOUGH_TOKENS` | Token balance too low | Wait for refill or upgrade |
| `REQUEST_THROTTLED` | Too many requests | Implement backoff |
| `INVALID_DOMAIN` | Invalid domain ID | Use valid domain (1-12) |
| `INVALID_ASIN` | Invalid ASIN format | Verify ASIN format |

### Handling Errors

```typescript
async function safeKeepaRequest(url: string) {
  const data = await keepaFetch(url)
  
  if (data.error) {
    throw new Error(`Keepa Error: ${data.error.type} - ${data.error.message}`)
  }
  
  // Check token balance
  if (data.tokensLeft < 100) {
    console.warn(`Low tokens: ${data.tokensLeft} left, refill in ${data.refillIn} min`)
  }
  
  return data
}
```

---

## Complete TypeScript Types

```typescript
// Full type definitions
interface KeepaProduct {
  productType: 0 | 1 | 2 | 3 | 4 | 5
  asin: string
  domainId: number
  title: string
  trackingSince: number
  listedSince: number
  lastUpdate: number
  lastRatingUpdate: number
  lastPriceChange: number
  lastEbayUpdate: number
  lastStockUpdate?: number
  
  images?: ImageObject[]
  rootCategory: number
  categories: number[]
  categoryTree: CategoryTreeNode[]
  
  parentAsin?: string
  parentAsinHistory?: string[]
  variations?: VariationObject[]
  historicalVariations?: string[]
  frequentlyBoughtTogether?: string[]
  
  eanList?: string[]
  upcList?: string[]
  manufacturer?: string
  brand?: string
  brandStoreName?: string
  productGroup?: string
  partNumber?: string
  model?: string
  color?: string
  size?: string
  edition?: string
  binding?: string
  
  numberOfItems: number
  numberOfPages: number
  packageHeight: number
  packageLength: number
  packageWidth: number
  packageWeight: number
  itemHeight: number
  itemLength: number
  itemWidth: number
  itemWeight: number
  
  availabilityAmazon: -1 | 0 | 1 | 2 | 3 | 4
  availabilityAmazonDelay?: [number, number]
  buyBoxEligibleOfferCounts?: number[]
  
  fbaFees?: { lastUpdate: number; pickAndPackFee: number }
  referralFeePercentage: number
  
  coupon?: [number, number]
  couponHistory?: number[]
  promotions?: PromotionObject[]
  
  csv: (number[] | null)[]
  salesRanks: { [categoryId: string]: number[] }
  salesRankReference: number
  salesRankReferenceHistory?: number[]
  
  monthlySold?: number
  monthlySoldHistory?: number[]
  
  stats?: StatisticsObject
  offers?: MarketplaceOffer[]
  liveOffersOrder?: number[]
  buyBoxSellerIdHistory?: string[]
  buyBoxUsedHistory?: string[]
  
  isAdultProduct: boolean
  isHeatSensitive?: boolean
  isSNS: boolean
  isRedirectASIN?: boolean
  offersSuccessful?: boolean
}

interface ImageObject {
  l: string    // Large filename
  lH: number   // Large height
  lW: number   // Large width
  m?: string   // Medium filename
  mH?: number  // Medium height
  mW?: number  // Medium width
}

interface CategoryTreeNode {
  catId: number
  name: string
}

interface VariationObject {
  asin: string
  image?: string
  attributes: { dimension: string; value: string }[]
}

interface PromotionObject {
  type: 'SNS'
  amount?: number
  discountPercent?: number
  snsBulkDiscountPercent?: number
}

interface MarketplaceOffer {
  offerId: number
  sellerId: string
  condition: 0 | 1 | 2 | 3 | 4 | 5
  conditionComment?: string
  isPrime: boolean
  isFBA: boolean
  isShippable: boolean
  isAddonItem: boolean
  isPreorder: boolean
  isWarehouseDeal: boolean
  isScam: boolean
  isSNS: boolean
  isPrimeExclusive: boolean
  isMAP: boolean
  lastSeen: number
  offerCSV: number[]
  stockCSV?: number[]
  rating: number
  ratingCount: number
}

interface StatisticsObject {
  current: number[]
  avg: number[]
  avg30: number[]
  avg90: number[]
  avg180: number[]
  avg365: number[]
  atIntervalStart: number[]
  minInInterval: [number, number][]
  maxInInterval: [number, number][]
  outOfStockPercentage: [number, number]
  
  // Buy Box (with offers/buybox param)
  buyBoxPrice?: number
  buyBoxShipping?: number
  buyBoxIsAmazon?: boolean
  buyBoxIsFBA?: boolean
  buyBoxSellerId?: string
  buyBoxUsedPrice?: number
  buyBoxUsedShipping?: number
  buyBoxUsedCondition?: number
  buyBoxUsedIsFBA?: boolean
  buyBoxUsedSellerId?: string
}
```

---

## Code Examples

### Complete Arbitrage Analysis

```typescript
import { gunzip } from 'node:zlib'
import { promisify } from 'node:util'

const gunzipAsync = promisify(gunzip)
const KEEPA_API = 'https://api.keepa.com'
const API_KEY = process.env.KEEPA_API_KEY!
const KEEPA_EPOCH = new Date('2011-01-01T00:00:00Z').getTime()

async function keepaFetch(url: string) {
  const response = await fetch(url)
  const buffer = await response.arrayBuffer()
  try {
    const decompressed = await gunzipAsync(Buffer.from(buffer))
    return JSON.parse(decompressed.toString())
  } catch {
    return JSON.parse(Buffer.from(buffer).toString())
  }
}

function keepaTimeToDate(keepaMinutes: number): Date {
  return new Date(KEEPA_EPOCH + keepaMinutes * 60 * 1000)
}

function parseHistory(csv: number[] | null): Array<{ date: Date; value: number }> {
  if (!csv) return []
  const history = []
  for (let i = 0; i < csv.length; i += 2) {
    if (csv[i + 1] !== -1) {
      history.push({ date: keepaTimeToDate(csv[i]), value: csv[i + 1] })
    }
  }
  return history
}

interface ArbitrageResult {
  asin: string
  title: string
  buyBoxPrice: number
  offerCount: number
  offerTrend: 'declining' | 'stable' | 'increasing'
  salesRank: number
  amazonInBuyBox: boolean
  score: number
  reasons: string[]
}

async function analyzeProduct(asin: string): Promise<ArbitrageResult> {
  const params = new URLSearchParams({
    key: API_KEY,
    domain: '1',
    asin,
    stats: '90',
    offers: '20',
    buybox: '1',
  })
  
  const data = await keepaFetch(`${KEEPA_API}/product?${params}`)
  const product = data.products[0]
  const stats = product.stats
  
  const reasons: string[] = []
  let score = 0
  
  // Offer count analysis
  const currentOffers = stats.current[11] || 0
  const avg30Offers = stats.avg30[11] || currentOffers
  const offerChange = avg30Offers > 0 ? ((currentOffers - avg30Offers) / avg30Offers) * 100 : 0
  
  let offerTrend: 'declining' | 'stable' | 'increasing'
  if (offerChange < -10) {
    offerTrend = 'declining'
    reasons.push(`Sellers declining: ${offerChange.toFixed(0)}%`)
    score += 2
  } else if (offerChange > 10) {
    offerTrend = 'increasing'
    reasons.push(`Warning: Sellers increasing: +${offerChange.toFixed(0)}%`)
    score -= 1
  } else {
    offerTrend = 'stable'
  }
  
  // Competition level
  if (currentOffers < 10) {
    reasons.push(`Low competition: ${currentOffers} sellers`)
    score += 1
  }
  
  // Amazon presence
  const amazonInBuyBox = stats.buyBoxIsAmazon || false
  if (!amazonInBuyBox) {
    reasons.push('Amazon not in Buy Box')
    score += 1
  } else {
    reasons.push('⚠️ Amazon in Buy Box')
    score -= 1
  }
  
  // Sales rank
  const salesRank = stats.current[3] || -1
  if (salesRank > 0 && salesRank < 50000) {
    reasons.push(`Strong sales rank: ${salesRank.toLocaleString()}`)
    score += 1
  }
  
  return {
    asin,
    title: product.title,
    buyBoxPrice: (stats.buyBoxPrice || 0) / 100,
    offerCount: currentOffers,
    offerTrend,
    salesRank,
    amazonInBuyBox,
    score,
    reasons,
  }
}

// Batch analysis
async function analyzeProducts(asins: string[]): Promise<ArbitrageResult[]> {
  const results: ArbitrageResult[] = []
  
  // Batch in groups of 100
  for (let i = 0; i < asins.length; i += 100) {
    const batch = asins.slice(i, i + 100)
    const params = new URLSearchParams({
      key: API_KEY,
      domain: '1',
      asin: batch.join(','),
      stats: '90',
    })
    
    const data = await keepaFetch(`${KEEPA_API}/product?${params}`)
    
    for (const product of data.products) {
      // Simplified analysis without offers (less tokens)
      const stats = product.stats
      const currentOffers = stats?.current?.[11] || 0
      const salesRank = stats?.current?.[3] || -1
      
      results.push({
        asin: product.asin,
        title: product.title,
        buyBoxPrice: (stats?.current?.[18] || 0) / 100,
        offerCount: currentOffers,
        offerTrend: 'stable',
        salesRank,
        amazonInBuyBox: product.availabilityAmazon === 0,
        score: 0,
        reasons: [],
      })
    }
    
    // Respect rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  return results
}
```

---

## Related Documentation

- **Business Guide:** [KEEPA-API-BUSINESS.md](./KEEPA-API-BUSINESS.md)
- **Official API Plans:** https://discuss.keepa.com/t/how-our-api-plans-work/410
- **Product Object Docs:** https://discuss.keepa.com/t/product-object/116
- **Product Finder Docs:** https://discuss.keepa.com/t/product-finder/5473
- **Statistics Object:** https://discuss.keepa.com/t/statistics-object/1308
