/**
 * Auto-List Single Item
 * 
 * Story 6: Single endpoint that creates a complete eBay listing from an ASIN
 * 
 * Flow:
 * 1. Authenticate user
 * 2. Fetch product data from Keepa
 * 3. Get eBay category suggestion (Story 4A)
 * 4. Get required aspects for category (Story 4B)
 * 5. Generate AI-optimized title & description (Story 5)
 * 6. Create inventory item
 * 7. Create offer with price and policies
 * 8. Publish to make live
 * 9. Store in database
 * 10. Return listing URL
 * 
 * POST /auto-list-single
 * Body: { asin, price, quantity?, condition?, publish? }
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { decrypt } = require('./utils/encryption');
const { getCategorySuggestion } = require('./get-ebay-category-suggestion');
const { getCategoryAspects } = require('./get-ebay-category-aspects');
const { generateListingContent } = require('./generate-ebay-listing-content');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SKU prefix per Pete's requirements
const SKU_PREFIX = 'wi_';

// Default policies (from Pete's eBay account)
const DEFAULT_POLICIES = {
  fulfillmentPolicyId: '107540197026',
  paymentPolicyId: '243561626026',
  returnPolicyId: '243561625026'
};

// Default merchant location
const DEFAULT_LOCATION = 'loc-94e1f3a0-6e1b-4d23-befc-750fe183';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  const startTime = Date.now();

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Track what we create for rollback on failure
  let sku = null;
  let offerId = null;
  let accessToken = null;

  try {
    console.log('🚀 auto-list-single called');

    // ─────────────────────────────────────────────────────────
    // Step 1: Authenticate
    // ─────────────────────────────────────────────────────────
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    console.log(`✅ User authenticated: ${user.id}`);

    // ─────────────────────────────────────────────────────────
    // Step 2: Parse & validate request
    // ─────────────────────────────────────────────────────────
    const {
      asin,
      price,
      quantity = 1,
      condition = 'NEW',
      publish = true
    } = JSON.parse(event.body);

    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid ASIN required (format: B followed by 9 alphanumeric characters)' }) };
    }
    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid price required (must be positive number)' }) };
    }

    sku = `${SKU_PREFIX}${asin}`;
    const priceValue = parseFloat(price).toFixed(2);
    console.log(`📦 Processing: ASIN=${asin}, SKU=${sku}, Price=$${priceValue}`);

    // ─────────────────────────────────────────────────────────
    // Step 3: Get eBay access token
    // ─────────────────────────────────────────────────────────
    console.log('🔑 Getting eBay access token...');
    accessToken = await getValidAccessToken(supabase, user.id);

    // ─────────────────────────────────────────────────────────
    // Step 4: Fetch product data from Keepa
    // ─────────────────────────────────────────────────────────
    console.log('🔍 Fetching product from Keepa...');
    const keepaResult = await fetchKeepaProduct(user.id, asin);
    if (!keepaResult.success) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: keepaResult.error }) };
    }
    const product = keepaResult.product;
    const originalTitle = product.title || 'Untitled Product';
    console.log(`✅ Got product: "${originalTitle.substring(0, 50)}..."`);

    // ─────────────────────────────────────────────────────────
    // Step 5: Get eBay category suggestion (Story 4A)
    // ─────────────────────────────────────────────────────────
    console.log('🏷️ Getting eBay category suggestion...');
    const categoryResult = await getCategorySuggestion(originalTitle);
    
    if (!categoryResult.categoryId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Failed to determine eBay category',
          message: categoryResult.error || 'No category suggestion returned',
          asin,
          title: originalTitle
        })
      };
    }
    console.log(`✅ Category: ${categoryResult.categoryId} - ${categoryResult.categoryName}`);

    // ─────────────────────────────────────────────────────────
    // Step 6: Get required aspects for category (Story 4B)
    // ─────────────────────────────────────────────────────────
    console.log('📋 Getting required aspects...');
    let categoryAspects = [];
    try {
      const aspectsResult = await getCategoryAspects(categoryResult.categoryId);
      categoryAspects = aspectsResult.aspects || [];
      console.log(`✅ Got ${categoryAspects.length} required aspects`);
    } catch (aspectError) {
      console.warn('⚠️ Failed to fetch aspects (continuing):', aspectError.message);
    }

    // ─────────────────────────────────────────────────────────
    // Step 7: Generate AI-optimized content (Story 5)
    // ─────────────────────────────────────────────────────────
    console.log('🤖 Generating AI-optimized listing content...');
    let aiContent;
    try {
      aiContent = await generateListingContent({
        title: originalTitle,
        description: product.description || '',
        features: product.features || [],
        brand: product.brand || '',
        model: product.model || '',
        color: product.color || '',
        category: categoryResult.categoryName
      });
      console.log(`✅ AI title: "${aiContent.title}" (${aiContent.generatedTitleLength} chars)`);
    } catch (aiError) {
      console.warn('⚠️ AI generation failed, using fallback:', aiError.message);
      aiContent = {
        title: originalTitle.substring(0, 80),
        description: buildFallbackDescription(product),
        aiModel: 'fallback'
      };
    }

    // ─────────────────────────────────────────────────────────
    // Step 8: Create inventory item
    // ─────────────────────────────────────────────────────────
    console.log('📦 Creating inventory item...');
    const inventoryItem = buildInventoryItem(product, aiContent, condition, quantity, categoryAspects);
    
    await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'PUT', body: JSON.stringify(inventoryItem) }
    );
    console.log('✅ Inventory item created');

    // ─────────────────────────────────────────────────────────
    // Step 9: Create offer
    // ─────────────────────────────────────────────────────────
    console.log('📋 Creating offer...');
    const offerPayload = {
      sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      categoryId: categoryResult.categoryId,
      listingPolicies: DEFAULT_POLICIES,
      pricingSummary: {
        price: { currency: 'USD', value: priceValue }
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

    // ─────────────────────────────────────────────────────────
    // Step 10: Publish offer (if requested)
    // ─────────────────────────────────────────────────────────
    let listingId = null;
    let listingUrl = null;

    if (publish) {
      console.log('🚀 Publishing offer...');
      const publishResult = await ebayApiRequest(
        accessToken,
        `/sell/inventory/v1/offer/${offerId}/publish`,
        { method: 'POST' }
      );
      listingId = publishResult.listingId;
      listingUrl = `https://www.ebay.com/itm/${listingId}`;
      console.log(`✅ Published: ${listingUrl}`);
    }

    // ─────────────────────────────────────────────────────────
    // Step 11: Store listing in database
    // ─────────────────────────────────────────────────────────
    if (listingId) {
      try {
        await supabase.from('ebay_listings').upsert({
          user_id: user.id,
          asin,
          sku,
          listing_id: listingId,
          offer_id: offerId,
          title: aiContent.title,
          original_title: originalTitle,
          price: parseFloat(priceValue),
          quantity,
          condition,
          category_id: categoryResult.categoryId,
          category_name: categoryResult.categoryName,
          status: 'active',
          created_at: new Date().toISOString()
        }, { onConflict: 'sku' });
        console.log('✅ Listing stored in database');
      } catch (dbError) {
        console.warn('⚠️ Failed to store in DB (non-blocking):', dbError.message);
      }
    }

    // ─────────────────────────────────────────────────────────
    // Success response
    // ─────────────────────────────────────────────────────────
    const elapsedMs = Date.now() - startTime;
    console.log(`✅ Complete in ${elapsedMs}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin,
        sku,
        title: aiContent.title,
        originalTitle,
        titleOptimized: originalTitle !== aiContent.title,
        aiModel: aiContent.aiModel || 'claude-3-haiku',
        price: priceValue,
        quantity,
        condition,
        categoryId: categoryResult.categoryId,
        categoryName: categoryResult.categoryName,
        offerId,
        listingId,
        listingUrl,
        published: publish,
        elapsedMs,
        message: publish ? 'Listing is live on eBay!' : 'Offer created (not published)'
      })
    };

  } catch (error) {
    console.error('❌ Error:', error.message);

    // ─────────────────────────────────────────────────────────
    // Rollback: Clean up any orphaned data
    // ─────────────────────────────────────────────────────────
    if (accessToken) {
      try {
        if (offerId) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/offer/${offerId}`, { method: 'DELETE' });
          console.log('🧹 Rolled back: offer deleted');
        }
        if (sku) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: 'DELETE' });
          console.log('🧹 Rolled back: inventory item deleted');
        }
      } catch (cleanupError) {
        console.warn('⚠️ Cleanup error:', cleanupError.message);
      }
    }

    const elapsedMs = Date.now() - startTime;
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to create listing',
        message: error.message,
        elapsedMs,
        rolledBack: true
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
    return { success: false, error: 'Keepa API key not configured. Please add it in Settings > API Keys.' };
  }

  const keepaKey = decrypt(keyData.api_key_encrypted);
  if (!keepaKey) {
    return { success: false, error: 'Failed to decrypt Keepa API key' };
  }

  const response = await fetch(
    `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180&offers=20`
  );
  const data = await response.json();

  if (!data.products || data.products.length === 0) {
    return { success: false, error: `Product not found on Amazon: ${asin}` };
  }

  return { success: true, product: data.products[0] };
}

function buildInventoryItem(product, aiContent, condition, quantity, categoryAspects = []) {
  // Extract images
  const images = [];
  if (product.imagesCSV) {
    product.imagesCSV.split(',').forEach(f => {
      const trimmed = f.trim();
      if (trimmed) images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
    });
  }

  // Build aspects from Keepa data
  const aspects = {};
  if (product.brand) aspects.Brand = [product.brand];
  if (product.model) aspects.Model = [product.model];
  if (product.partNumber) aspects.MPN = [product.partNumber];
  if (product.manufacturer) aspects.Manufacturer = [product.manufacturer];
  if (product.color) aspects.Color = [product.color];

  // Merge required category aspects where we have matching data
  for (const aspect of categoryAspects) {
    const name = aspect.name;
    if (aspects[name]) continue; // Already have it
    
    // Try to map from Keepa data
    const value = mapAspectFromProduct(name, product);
    if (value) {
      aspects[name] = [value];
    }
  }

  const item = {
    availability: {
      shipToLocationAvailability: { quantity }
    },
    condition: mapCondition(condition),
    product: {
      title: aiContent.title,
      description: aiContent.description,
      aspects,
      imageUrls: images.slice(0, 12)
    }
  };

  // Add product identifiers
  if (product.brand) item.product.brand = product.brand;
  if (product.partNumber) item.product.mpn = product.partNumber;
  if (product.upcList?.length > 0) item.product.upc = [product.upcList[0]];
  if (product.eanList?.length > 0) item.product.ean = [product.eanList[0]];

  return item;
}

function mapAspectFromProduct(aspectName, product) {
  const lowerName = aspectName.toLowerCase();
  
  if (lowerName === 'brand') return product.brand;
  if (lowerName === 'model') return product.model;
  if (lowerName === 'mpn' || lowerName === 'manufacturer part number') return product.partNumber;
  if (lowerName === 'manufacturer') return product.manufacturer;
  if (lowerName === 'color') return product.color;
  if (lowerName === 'upc' && product.upcList?.length > 0) return product.upcList[0];
  
  return null;
}

function buildFallbackDescription(product) {
  if (product.features?.length > 0) {
    return '<h3>Product Features</h3><ul>' +
      product.features.slice(0, 10).map(f => `<li>${escapeHtml(f)}</li>`).join('') +
      '</ul>';
  }
  return '<p>Quality product. See photos for details.</p>';
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
    'NEW_OTHER': 'NEW_OTHER',
    'VERY_GOOD': 'USED_VERY_GOOD',
    'GOOD': 'USED_GOOD',
    'ACCEPTABLE': 'USED_ACCEPTABLE'
  };
  return map[condition?.toUpperCase()] || 'NEW';
}
