/**
 * Auto-List Single Item
 * 
 * Story 6: Single endpoint that creates a complete eBay listing from an ASIN
 * 
 * Flow:
 * 1. Fetch product data from Keepa
 * 2. Auto-detect eBay category from Amazon data
 * 3. Create inventory item
 * 4. Create offer with price and policies
 * 5. Publish to make live
 * 6. Return listing URL
 * 
 * POST /auto-list-single
 * Body: { asin, price, quantity?, condition?, publish? }
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { getEbayCategory } = require('./utils/category-mapper');
const { decrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SKU prefix
const SKU_PREFIX = 'wi_';

// Default policies
const DEFAULT_POLICIES = {
  fulfillmentPolicyId: '107540197026',
  paymentPolicyId: '243561626026',
  returnPolicyId: '243561625026'
};

// Default merchant location
const DEFAULT_LOCATION = 'loc-94e1f3a0-6e1b-4d23-befc-750fe183';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Track what we create for cleanup on failure
  let sku = null;
  let offerId = null;
  let accessToken = null;

  try {
    console.log('🚀 auto-list-single called');

    // 1. Authenticate
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // 2. Parse request
    const {
      asin,
      price,
      quantity = 1,
      condition = 'NEW',
      publish = true  // Default to publishing
    } = JSON.parse(event.body);

    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid ASIN required' }) };
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid price required' }) };
    }

    sku = `${SKU_PREFIX}${asin}`;
    console.log(`📦 Processing ASIN: ${asin}, SKU: ${sku}, Price: $${price}`);

    // 3. Get eBay access token
    accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Fetch Keepa data
    console.log('🔍 Fetching from Keepa...');
    const keepaData = await fetchKeepaProduct(user.id, asin);
    if (!keepaData.success) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: keepaData.error }) };
    }
    console.log(`✅ Got product: ${keepaData.product.title?.substring(0, 50)}...`);

    // 5. Auto-detect category
    console.log('🏷️ Auto-detecting category...');
    const category = await getEbayCategory(supabase, keepaData.product);
    console.log(`✅ Category: ${category.categoryName} (${category.categoryId}) [${category.matchType}]`);

    // 6. Create inventory item
    console.log('📦 Creating inventory item...');
    const inventoryItem = buildInventoryItem(keepaData, condition, quantity);
    await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'PUT', body: JSON.stringify(inventoryItem) }
    );
    console.log('✅ Inventory item created');

    // 7. Create offer
    console.log('📋 Creating offer...');
    const offerPayload = {
      sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      categoryId: category.categoryId,
      listingPolicies: DEFAULT_POLICIES,
      pricingSummary: {
        price: { currency: 'USD', value: parseFloat(price).toFixed(2) }
      },
      merchantLocationKey: DEFAULT_LOCATION
    };

    const offerResult = await ebayApiRequest(
      accessToken,
      '/sell/inventory/v1/offer',
      { method: 'POST', body: JSON.stringify(offerPayload) }
    );
    offerId = offerResult.offerId;
    console.log(`✅ Offer created: ${offerId}`);

    // 8. Publish (if requested)
    let listingId = null;
    let listingUrl = null;

    if (publish) {
      console.log('🚀 Publishing...');
      const publishResult = await ebayApiRequest(
        accessToken,
        `/sell/inventory/v1/offer/${offerId}/publish`,
        { method: 'POST' }
      );
      listingId = publishResult.listingId;
      listingUrl = `https://www.ebay.com/itm/${listingId}`;
      console.log(`✅ Published: ${listingUrl}`);
    }

    // Success!
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin,
        sku,
        title: keepaData.product.title?.substring(0, 80),
        price,
        quantity,
        condition,
        category: {
          id: category.categoryId,
          name: category.categoryName,
          matchType: category.matchType
        },
        offerId,
        listingId,
        listingUrl,
        published: publish,
        message: publish ? 'Listing is live on eBay!' : 'Offer created (not published)'
      })
    };

  } catch (error) {
    console.error('❌ Error:', error.message);

    // Cleanup on failure
    if (accessToken) {
      try {
        if (offerId) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/offer/${offerId}`, { method: 'DELETE' });
          console.log('🧹 Cleaned up offer');
        }
        if (sku) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: 'DELETE' });
          console.log('🧹 Cleaned up inventory item');
        }
      } catch (cleanupError) {
        console.log('⚠️ Cleanup failed:', cleanupError.message);
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create listing',
        message: error.message
      })
    };
  }
};

// ─────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────

async function fetchKeepaProduct(userId, asin) {
  const { data: keyData } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', 'keepa')
    .single();

  if (!keyData) {
    return { success: false, error: 'Keepa API key not found' };
  }

  const keepaKey = decrypt(keyData.api_key_encrypted);
  if (!keepaKey) {
    return { success: false, error: 'Failed to decrypt Keepa key' };
  }

  const response = await fetch(
    `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180&offers=20`
  );
  const data = await response.json();

  if (!data.products || data.products.length === 0) {
    return { success: false, error: `Product not found: ${asin}` };
  }

  return { success: true, product: data.products[0] };
}

function buildInventoryItem(keepaData, condition, quantity) {
  const p = keepaData.product;

  // Extract images
  const images = [];
  if (p.imagesCSV) {
    p.imagesCSV.split(',').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
    });
  }

  // Build aspects
  const aspects = {};
  if (p.brand) aspects.Brand = [p.brand];
  if (p.model) aspects.Model = [p.model];
  if (p.partNumber) aspects.MPN = [p.partNumber];
  if (p.manufacturer) aspects.Manufacturer = [p.manufacturer];
  if (p.color) aspects.Color = [p.color];

  const item = {
    availability: {
      shipToLocationAvailability: { quantity }
    },
    condition: mapCondition(condition),
    product: {
      title: p.title?.substring(0, 80) || 'Untitled Product',
      description: p.description || buildDescription(p),
      aspects,
      imageUrls: images.slice(0, 12)
    }
  };

  // Add identifiers
  if (p.brand) item.product.brand = p.brand;
  if (p.partNumber) item.product.mpn = p.partNumber;
  if (p.upcList?.length > 0) item.product.upc = [p.upcList[0]];
  if (p.eanList?.length > 0) item.product.ean = [p.eanList[0]];

  return item;
}

function buildDescription(product) {
  if (product.features?.length > 0) {
    return '<h3>Features</h3><ul>' + 
      product.features.map(f => `<li>${escapeHtml(f)}</li>`).join('') + 
      '</ul>';
  }
  return 'See photos for details.';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function mapCondition(condition) {
  const map = {
    'NEW': 'NEW',
    'LIKE_NEW': 'LIKE_NEW',
    'VERY_GOOD': 'USED_VERY_GOOD',
    'GOOD': 'USED_GOOD',
    'ACCEPTABLE': 'USED_ACCEPTABLE'
  };
  return map[condition?.toUpperCase()] || 'NEW';
}
