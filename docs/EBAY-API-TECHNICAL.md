# eBay API - Technical Reference

> Implementation details, endpoints, and code patterns - January 2026

## Base URLs

| Environment | API Base | Auth Base |
|-------------|----------|-----------|
| Production | `https://api.ebay.com` | `https://auth.ebay.com` |
| Sandbox | `https://api.sandbox.ebay.com` | `https://auth.sandbox.ebay.com` |

---

## Authentication (OAuth 2.0)

### Token Types

| Token | Grant Flow | Lifetime | Use Case |
|-------|------------|----------|----------|
| Application Token | Client Credentials | 2 hours | Public data (browse, taxonomy) |
| User Token | Authorization Code | 2 hours | Seller operations |
| Refresh Token | - | 18 months | Renew user tokens |

### Token Endpoint

```
POST https://api.ebay.com/identity/v1/oauth2/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic {base64(client_id:client_secret)}
```

### Get Application Token

```typescript
async function getAppToken(): Promise<string> {
  const credentials = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    }),
  });

  const data = await response.json();
  return data.access_token;
}
```

### User Authorization Flow

```typescript
// Step 1: Generate auth URL
function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: EBAY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: EBAY_REDIRECT_URI,
    scope: [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
    ].join(' '),
    state,
  });
  return `https://auth.ebay.com/oauth2/authorize?${params}`;
}

// Step 2: Exchange code for tokens
async function exchangeCode(code: string): Promise<TokenResponse> {
  const credentials = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: EBAY_REDIRECT_URI,
    }),
  });

  return response.json();
}

// Step 3: Refresh token
async function refreshToken(refreshToken: string): Promise<TokenResponse> {
  const credentials = Buffer.from(
    `${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  return response.json();
}
```

### OAuth Scopes

```typescript
// Sell scopes
const SELL_SCOPES = {
  inventory: 'https://api.ebay.com/oauth/api_scope/sell.inventory',
  inventoryReadonly: 'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  account: 'https://api.ebay.com/oauth/api_scope/sell.account',
  fulfillment: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  fulfillmentReadonly: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  analytics: 'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  marketing: 'https://api.ebay.com/oauth/api_scope/sell.marketing',
};

// For price reducer, minimum needed:
const PRICE_REDUCER_SCOPES = [
  SELL_SCOPES.inventory,  // Read/write inventory and offers
];
```

---

## Inventory API

**Base:** `https://api.ebay.com/sell/inventory/v1`  
**Limit:** 2,000,000 calls/day

### bulkUpdatePriceQuantity ⭐ (Key for Price Reducer)

```typescript
// POST /sell/inventory/v1/bulk_update_price_quantity
interface BulkPriceQuantityRequest {
  requests: Array<{
    offers: Array<{
      availableQuantity?: number;
      offerId: string;
      price?: {
        currency: string;
        value: string;
      };
    }>;
    shipToLocationAvailability?: {
      quantity: number;
    };
    sku: string;
  }>;
}

async function bulkUpdatePriceQuantity(
  token: string,
  updates: BulkPriceQuantityRequest
): Promise<BulkPriceQuantityResponse> {
  const response = await fetch(
    'https://api.ebay.com/sell/inventory/v1/bulk_update_price_quantity',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
      },
      body: JSON.stringify(updates),
    }
  );

  return response.json();
}

// Example: Update 25 prices
const request: BulkPriceQuantityRequest = {
  requests: items.slice(0, 25).map(item => ({
    sku: item.sku,
    offers: [{
      offerId: item.offerId,
      price: {
        currency: 'USD',
        value: item.newPrice.toFixed(2),
      },
    }],
  })),
};
```

### bulkGetInventoryItem

```typescript
// POST /sell/inventory/v1/bulk_get_inventory_item
interface BulkGetRequest {
  requests: Array<{ sku: string }>;
}

async function bulkGetInventoryItem(
  token: string,
  skus: string[]
): Promise<BulkGetResponse> {
  const response = await fetch(
    'https://api.ebay.com/sell/inventory/v1/bulk_get_inventory_item',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: skus.slice(0, 25).map(sku => ({ sku })),
      }),
    }
  );

  return response.json();
}
```

### getInventoryItems (Paginated)

```typescript
// GET /sell/inventory/v1/inventory_item
async function getInventoryItems(
  token: string,
  limit = 100,
  offset = 0
): Promise<InventoryItemsResponse> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });

  const response = await fetch(
    `https://api.ebay.com/sell/inventory/v1/inventory_item?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.json();
}

// Paginate through all items
async function getAllInventoryItems(token: string): Promise<InventoryItem[]> {
  const allItems: InventoryItem[] = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await getInventoryItems(token, limit, offset);
    allItems.push(...response.inventoryItems);
    
    if (response.inventoryItems.length < limit) break;
    offset += limit;
  }

  return allItems;
}
```

### getOffers (Get offers for SKU)

```typescript
// GET /sell/inventory/v1/offer
async function getOffers(
  token: string,
  sku: string
): Promise<OffersResponse> {
  const params = new URLSearchParams({ sku });

  const response = await fetch(
    `https://api.ebay.com/sell/inventory/v1/offer?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.json();
}
```

### Inventory API Endpoints Summary

| Method | Endpoint | Batch Size |
|--------|----------|------------|
| `bulkCreateOrReplaceInventoryItem` | POST `/bulk_create_or_replace_inventory_item` | 25 |
| `bulkGetInventoryItem` | POST `/bulk_get_inventory_item` | 25 |
| `bulkUpdatePriceQuantity` | POST `/bulk_update_price_quantity` | 25 |
| `createOrReplaceInventoryItem` | PUT `/inventory_item/{sku}` | 1 |
| `getInventoryItem` | GET `/inventory_item/{sku}` | 1 |
| `getInventoryItems` | GET `/inventory_item` | 100 (paginated) |
| `deleteInventoryItem` | DELETE `/inventory_item/{sku}` | 1 |
| `bulkCreateOffer` | POST `/bulk_create_offer` | 25 |
| `bulkPublishOffer` | POST `/bulk_publish_offer` | 25 |
| `createOffer` | POST `/offer` | 1 |
| `getOffer` | GET `/offer/{offerId}` | 1 |
| `getOffers` | GET `/offer?sku={sku}` | varies |
| `updateOffer` | PUT `/offer/{offerId}` | 1 |
| `publishOffer` | POST `/offer/{offerId}/publish` | 1 |
| `withdrawOffer` | POST `/offer/{offerId}/withdraw` | 1 |
| `getListingFees` | POST `/offer/get_listing_fees` | 250 |
| `bulkMigrateListing` | POST `/bulk_migrate_listing` | varies |

---

## Fulfillment API

**Base:** `https://api.ebay.com/sell/fulfillment/v1`  
**Limit:** 100,000 calls/day (orders), 250,000/day (disputes)

### getOrders

```typescript
// GET /sell/fulfillment/v1/order
async function getOrders(
  token: string,
  options: {
    filter?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<OrdersResponse> {
  const params = new URLSearchParams();
  if (options.filter) params.set('filter', options.filter);
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.offset) params.set('offset', options.offset.toString());

  const response = await fetch(
    `https://api.ebay.com/sell/fulfillment/v1/order?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.json();
}

// Example: Get orders from last 7 days
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const orders = await getOrders(token, {
  filter: `creationdate:[${sevenDaysAgo}..]`,
  limit: 50,
});
```

### createShippingFulfillment

```typescript
// POST /sell/fulfillment/v1/order/{orderId}/shipping_fulfillment
async function addTracking(
  token: string,
  orderId: string,
  tracking: {
    lineItemId: string;
    trackingNumber: string;
    carrier: string;
  }
): Promise<void> {
  const response = await fetch(
    `https://api.ebay.com/sell/fulfillment/v1/order/${orderId}/shipping_fulfillment`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        lineItems: [{ lineItemId: tracking.lineItemId, quantity: 1 }],
        shippingCarrierCode: tracking.carrier,
        trackingNumber: tracking.trackingNumber,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to add tracking: ${response.status}`);
  }
}
```

---

## Browse API

**Base:** `https://api.ebay.com/buy/browse/v1`  
**Limit:** 5,000 calls/day  
**Auth:** Application token (client credentials)

### search

```typescript
// GET /buy/browse/v1/item_summary/search
async function searchItems(
  token: string,
  query: string,
  options: {
    limit?: number;
    categoryIds?: string;
    filter?: string;
  } = {}
): Promise<SearchResponse> {
  const params = new URLSearchParams({ q: query });
  if (options.limit) params.set('limit', options.limit.toString());
  if (options.categoryIds) params.set('category_ids', options.categoryIds);
  if (options.filter) params.set('filter', options.filter);

  const response = await fetch(
    `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    }
  );

  return response.json();
}
```

### getItem

```typescript
// GET /buy/browse/v1/item/{itemId}
async function getItem(
  token: string,
  itemId: string
): Promise<ItemResponse> {
  const response = await fetch(
    `https://api.ebay.com/buy/browse/v1/item/${itemId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',
      },
    }
  );

  return response.json();
}
```

---

## Taxonomy API

**Base:** `https://api.ebay.com/commerce/taxonomy/v1`  
**Limit:** 5,000 calls/day

### getCategoryTree

```typescript
// GET /commerce/taxonomy/v1/category_tree/{category_tree_id}
async function getCategoryTree(
  token: string,
  categoryTreeId = '0' // 0 = eBay US
): Promise<CategoryTreeResponse> {
  const response = await fetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${categoryTreeId}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.json();
}
```

### getItemAspectsForCategory

```typescript
// GET /commerce/taxonomy/v1/category_tree/{tree_id}/get_item_aspects_for_category
async function getItemAspects(
  token: string,
  categoryId: string,
  categoryTreeId = '0'
): Promise<ItemAspectsResponse> {
  const params = new URLSearchParams({ category_id: categoryId });

  const response = await fetch(
    `https://api.ebay.com/commerce/taxonomy/v1/category_tree/${categoryTreeId}/get_item_aspects_for_category?${params}`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    }
  );

  return response.json();
}
```

---

## Error Handling

### Response Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Process response |
| 201 | Created | Resource created |
| 204 | No Content | Success, no body |
| 400 | Bad Request | Fix request params |
| 401 | Unauthorized | Refresh token |
| 403 | Forbidden | Check OAuth scopes |
| 404 | Not Found | Resource doesn't exist |
| 429 | Rate Limited | Back off, retry |
| 500 | Server Error | Retry with backoff |

### Error Response Format

```typescript
interface EbayError {
  errors: Array<{
    errorId: number;
    domain: string;
    category: string;
    message: string;
    longMessage?: string;
    parameters?: Array<{ name: string; value: string }>;
  }>;
}

// Error handling wrapper
async function ebayFetch<T>(url: string, options: RequestInit): Promise<T> {
  const response = await fetch(url, options);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('TOKEN_EXPIRED');
    }
    if (response.status === 429) {
      throw new Error('RATE_LIMITED');
    }

    const error: EbayError = await response.json();
    const message = error.errors?.[0]?.message || `HTTP ${response.status}`;
    throw new Error(`eBay API Error: ${message}`);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json();
}
```

### Rate Limit Headers

```typescript
// Check rate limit headers
function checkRateLimits(response: Response): void {
  const limit = response.headers.get('X-EBAY-API-CALL-LIMIT');
  const usage = response.headers.get('X-EBAY-API-CALL-USAGE');
  
  if (limit && usage) {
    console.log(`Rate limit: ${usage}/${limit}`);
  }
}
```

---

## Types

```typescript
interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

interface InventoryItem {
  sku: string;
  availability: {
    shipToLocationAvailability: {
      quantity: number;
    };
  };
  condition: 'NEW' | 'LIKE_NEW' | 'VERY_GOOD' | 'GOOD' | 'ACCEPTABLE';
  product: {
    title: string;
    description: string;
    aspects: Record<string, string[]>;
    imageUrls: string[];
    brand?: string;
    mpn?: string;
    upc?: string[];
  };
}

interface Offer {
  offerId?: string;
  sku: string;
  marketplaceId: string;
  format: 'FIXED_PRICE' | 'AUCTION';
  availableQuantity: number;
  categoryId: string;
  listingPolicies: {
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
  };
  pricingSummary: {
    price: {
      currency: string;
      value: string;
    };
  };
  listingDescription?: string;
}

interface Order {
  orderId: string;
  creationDate: string;
  orderFulfillmentStatus: 'FULFILLED' | 'IN_PROGRESS' | 'NOT_STARTED';
  orderPaymentStatus: 'PAID' | 'PENDING' | 'FAILED';
  pricingSummary: {
    total: { value: string; currency: string };
  };
  lineItems: Array<{
    lineItemId: string;
    sku: string;
    title: string;
    quantity: number;
    lineItemCost: { value: string; currency: string };
  }>;
  buyer: {
    username: string;
  };
  fulfillmentStartInstructions: Array<{
    shippingStep: {
      shipTo: {
        fullName: string;
        contactAddress: {
          addressLine1: string;
          city: string;
          stateOrProvince: string;
          postalCode: string;
          countryCode: string;
        };
      };
    };
  }>;
}
```

---

## Complete Price Update Example

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

interface PriceUpdate {
  sku: string;
  offerId: string;
  newPrice: number;
}

async function updatePrices(
  userId: string,
  updates: PriceUpdate[]
): Promise<{ success: number; failed: number }> {
  // Get user's eBay token
  const token = await getValidUserToken(userId);
  
  let success = 0;
  let failed = 0;

  // Process in batches of 25
  for (let i = 0; i < updates.length; i += 25) {
    const batch = updates.slice(i, i + 25);

    const request = {
      requests: batch.map(u => ({
        sku: u.sku,
        offers: [{
          offerId: u.offerId,
          price: {
            currency: 'USD',
            value: u.newPrice.toFixed(2),
          },
        }],
      })),
    };

    try {
      const response = await fetch(
        'https://api.ebay.com/sell/inventory/v1/bulk_update_price_quantity',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Content-Language': 'en-US',
          },
          body: JSON.stringify(request),
        }
      );

      const result = await response.json();

      // Count successes and failures
      for (const r of result.responses || []) {
        if (r.statusCode === 200) {
          success++;
        } else {
          failed++;
          console.error(`Failed to update ${r.sku}:`, r.errors);
        }
      }
    } catch (error) {
      console.error('Batch failed:', error);
      failed += batch.length;
    }
  }

  return { success, failed };
}

async function getValidUserToken(userId: string): Promise<string> {
  const { data } = await supabase
    .from('user_profiles')
    .select('ebay_access_token, ebay_refresh_token, ebay_token_expires_at')
    .eq('user_id', userId)
    .single();

  if (!data?.ebay_access_token) {
    throw new Error('No eBay token found');
  }

  // Check if token expires within 5 minutes
  const expiresAt = new Date(data.ebay_token_expires_at).getTime();
  if (Date.now() > expiresAt - 5 * 60 * 1000) {
    // Refresh the token
    const newTokens = await refreshToken(data.ebay_refresh_token);
    
    // Store new tokens
    await supabase
      .from('user_profiles')
      .update({
        ebay_access_token: newTokens.access_token,
        ebay_token_expires_at: new Date(
          Date.now() + newTokens.expires_in * 1000
        ).toISOString(),
      })
      .eq('user_id', userId);

    return newTokens.access_token;
  }

  return data.ebay_access_token;
}
```

---

## Quick Reference

### Headers for API Calls

```typescript
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
  'Content-Language': 'en-US',              // For write operations
  'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US',     // For Browse API
};
```

### Common Marketplace IDs

| ID | Marketplace |
|----|-------------|
| `EBAY_US` | eBay US |
| `EBAY_CA` | eBay Canada |
| `EBAY_GB` | eBay UK |
| `EBAY_AU` | eBay Australia |
| `EBAY_DE` | eBay Germany |

---

*See EBAY-API-BUSINESS.md for strategic guidance and use case recommendations.*
