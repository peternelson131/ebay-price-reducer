/**
 * Auto-List v2 - Simplified Approach
 * 
 * Uses eBay Taxonomy API for category selection (not custom mapping)
 * 
 * Flow:
 * 1. Fetch product from Keepa
 * 2. Call Taxonomy API with title → Get eBay category ID
 * 3. Look up category in ebay_categories_v2 → Get specific aspects
 * 4. Build inventory item:
 *    - Universal aspects from Keepa (Brand, Model, MPN)
 *    - Specific aspects from our table
 * 5. Create offer + publish
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { decrypt } = require('./utils/encryption');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SKU_PREFIX = 'wi_';
const DEFAULT_POLICIES = {
  fulfillmentPolicyId: '107540197026',
  paymentPolicyId: '243561626026',
  returnPolicyId: '243561625026'
};
const DEFAULT_LOCATION = 'loc-94e1f3a0-6e1b-4d23-befc-750fe183';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  let sku = null, offerId = null, accessToken = null;

  try {
    // 1. Auth
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

    // 2. Parse request
    const { asin, price, quantity = 1, condition = 'NEW', publish = true } = JSON.parse(event.body);
    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid ASIN required' }) };
    if (!price || parseFloat(price) <= 0) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid price required' }) };

    sku = `${SKU_PREFIX}${asin}`;
    console.log(`🚀 auto-list-v2: ${asin} @ $${price}`);

    // 3. Get eBay token
    accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Fetch from Keepa
    console.log('📦 Fetching from Keepa...');
    const keepa = await fetchKeepa(user.id, asin);
    if (!keepa.success) return { statusCode: 400, headers, body: JSON.stringify({ error: keepa.error }) };
    console.log(`   Title: ${keepa.product.title?.substring(0, 50)}...`);

    // 5. Get category from eBay Taxonomy API
    console.log('🏷️ Getting category from Taxonomy API...');
    const category = await getCategoryFromTaxonomy(accessToken, keepa.product.title);
    console.log(`   Category: ${category.name} (${category.id})`);

    // 6. Get specific aspects from our table
    console.log('📋 Looking up specific aspects...');
    const { data: catData } = await supabase
      .from('ebay_categories_v2')
      .select('*')
      .eq('category_id', category.id)
      .single();
    
    const specificAspects = catData?.specific_aspects || {};
    console.log(`   Specific aspects: ${Object.keys(specificAspects).join(', ') || 'none'}`);

    // 7. Build inventory item
    console.log('📦 Creating inventory item...');
    const inventoryItem = buildInventoryItem(keepa.product, condition, quantity, specificAspects);
    await ebayApiRequest(accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
      method: 'PUT', body: JSON.stringify(inventoryItem)
    });

    // 8. Create offer
    console.log('📋 Creating offer...');
    const offer = await ebayApiRequest(accessToken, '/sell/inventory/v1/offer', {
      method: 'POST',
      body: JSON.stringify({
        sku,
        marketplaceId: 'EBAY_US',
        format: 'FIXED_PRICE',
        availableQuantity: quantity,
        categoryId: category.id,
        listingPolicies: DEFAULT_POLICIES,
        pricingSummary: { price: { currency: 'USD', value: parseFloat(price).toFixed(2) } },
        merchantLocationKey: DEFAULT_LOCATION
      })
    });
    offerId = offer.offerId;

    // 9. Publish
    let listingId = null, listingUrl = null;
    if (publish) {
      console.log('🚀 Publishing...');
      const pub = await ebayApiRequest(accessToken, `/sell/inventory/v1/offer/${offerId}/publish`, { method: 'POST' });
      listingId = pub.listingId;
      listingUrl = `https://www.ebay.com/itm/${listingId}`;
      console.log(`✅ Live: ${listingUrl}`);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin, sku, price,
        title: keepa.product.title?.substring(0, 80),
        category: { id: category.id, name: category.name },
        specificAspects: Object.keys(specificAspects),
        offerId, listingId, listingUrl,
        published: publish
      })
    };

  } catch (error) {
    console.error('❌ Error:', error.message);
    // Cleanup
    if (accessToken && offerId) {
      try { await ebayApiRequest(accessToken, `/sell/inventory/v1/offer/${offerId}`, { method: 'DELETE' }); } catch(e) {}
    }
    if (accessToken && sku) {
      try { await ebayApiRequest(accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: 'DELETE' }); } catch(e) {}
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed', message: error.message }) };
  }
};

// ── Helpers ──────────────────────────────────────────────

async function fetchKeepa(userId, asin) {
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', userId).eq('service', 'keepa').single();
  if (!keyData) return { success: false, error: 'Keepa key not found' };
  
  const key = decrypt(keyData.api_key_encrypted);
  const resp = await fetch(`https://api.keepa.com/product?key=${key}&domain=1&asin=${asin}&stats=180&offers=20`);
  const data = await resp.json();
  
  if (!data.products?.[0]) return { success: false, error: 'Product not found' };
  return { success: true, product: data.products[0] };
}

async function getCategoryFromTaxonomy(accessToken, title) {
  const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(title.substring(0, 100))}`;
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
  const data = await resp.json();
  
  if (data.categorySuggestions?.[0]) {
    const cat = data.categorySuggestions[0].category;
    return { id: cat.categoryId, name: cat.categoryName };
  }
  return { id: '99', name: 'Everything Else' }; // Fallback
}

function buildInventoryItem(product, condition, quantity, specificAspects) {
  // Images
  const images = [];
  if (product.imagesCSV) {
    product.imagesCSV.split(',').forEach(f => {
      if (f.trim()) images.push(`https://m.media-amazon.com/images/I/${f.trim()}`);
    });
  }

  // Universal aspects (always from Keepa)
  const aspects = {};
  if (product.brand) aspects.Brand = [product.brand];
  if (product.model) aspects.Model = [product.model];
  if (product.partNumber) aspects.MPN = [product.partNumber];
  if (product.color) aspects.Color = [product.color];

  // Add specific aspects from our table (with defaults)
  for (const [name, config] of Object.entries(specificAspects)) {
    if (name === 'Game Name') {
      aspects[name] = [product.title?.substring(0, 65) || 'Game'];
    } else if (config.default) {
      aspects[name] = [config.default];
    }
    // If no default and we can't determine, skip (will fail - that's ok for testing)
  }

  return {
    availability: { shipToLocationAvailability: { quantity } },
    condition: condition === 'NEW' ? 'NEW' : 'USED_GOOD',
    product: {
      title: product.title?.substring(0, 80) || 'Product',
      description: product.description?.substring(0, 4000) || 'See photos.',
      aspects,
      imageUrls: images.slice(0, 12),
      brand: product.brand,
      mpn: product.partNumber,
      upc: product.upcList?.[0] ? [product.upcList[0]] : undefined
    }
  };
}
