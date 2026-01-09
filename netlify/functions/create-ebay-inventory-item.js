/**
 * Create eBay Inventory Item
 * 
 * Story 1: Create eBay Inventory Item from ASIN
 * 
 * Flow:
 * 1. Authenticate user
 * 2. Fetch product data from Keepa
 * 3. Transform to eBay inventory item format
 * 4. Create inventory item via eBay API
 * 5. Return SKU and details
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

// SKU prefix per Pete's requirements
const SKU_PREFIX = 'wi_';

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('📦 create-ebay-inventory-item called');

    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse request
    const { asin, condition = 'NEW', quantity = 1 } = JSON.parse(event.body);

    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }

    // Validate ASIN format
    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid ASIN format' })
      };
    }

    // Generate SKU
    const sku = `${SKU_PREFIX}${asin}`;
    console.log(`📝 Generated SKU: ${sku}`);

    // 3. Fetch product data from Keepa
    console.log('🔍 Fetching product data from Keepa...');
    const keepaData = await fetchKeepaProduct(user.id, asin);
    
    if (!keepaData.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: keepaData.error || 'Failed to fetch product data' })
      };
    }

    const { ebayDraft, keepaData: rawKeepa } = keepaData;
    console.log(`✅ Got Keepa data: ${ebayDraft.title}`);

    // 4. Get valid eBay access token
    console.log('🔑 Getting eBay access token...');
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 5. Build eBay Inventory Item payload
    const inventoryItem = buildInventoryItem(ebayDraft, rawKeepa, condition, quantity);
    console.log('📋 Built inventory item payload');

    // 6. Create inventory item via eBay API
    console.log(`📤 Creating inventory item with SKU: ${sku}`);
    
    const result = await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: 'PUT',
        body: JSON.stringify(inventoryItem)
      }
    );

    console.log('✅ eBay inventory item created successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sku: sku,
        asin: asin,
        title: ebayDraft.title,
        condition: condition,
        quantity: quantity,
        message: 'Inventory item created successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error creating inventory item:', error);
    
    // Parse eBay API errors for better messages
    let errorMessage = error.message;
    if (error.message.includes('eBay API error')) {
      errorMessage = error.message;
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create inventory item',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

/**
 * Fetch product data from Keepa API
 */
async function fetchKeepaProduct(userId, asin) {
  // Get user's Keepa API key
  const { data: keyData, error: keyError } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', 'keepa')
    .single();

  if (keyError || !keyData) {
    return { success: false, error: 'Keepa API key not found. Please add it in API Keys.' };
  }

  const keepaApiKey = decrypt(keyData.api_key_encrypted);
  if (!keepaApiKey) {
    return { success: false, error: 'Failed to decrypt Keepa API key' };
  }

  // Fetch from Keepa
  const keepaUrl = `https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}&stats=180&offers=20`;
  
  const response = await fetch(keepaUrl);
  const data = await response.json();

  if (!response.ok || !data.products || data.products.length === 0) {
    return { success: false, error: `Product not found for ASIN: ${asin}` };
  }

  const product = data.products[0];
  
  // Transform to eBay format (reusing logic from keepa-fetch-product.js)
  const ebayDraft = transformKeepaToEbay(product);

  return {
    success: true,
    keepaData: product,
    ebayDraft: ebayDraft
  };
}

/**
 * Transform Keepa data to eBay draft format
 */
function transformKeepaToEbay(keepaProduct) {
  // Extract images
  const images = [];
  
  if (keepaProduct.images && Array.isArray(keepaProduct.images)) {
    keepaProduct.images.forEach(imgObj => {
      if (imgObj) {
        const imageVariant = imgObj.l || imgObj.m;
        if (imageVariant) {
          images.push(`https://m.media-amazon.com/images/I/${imageVariant}`);
        }
      }
    });
  } else if (keepaProduct.imagesCSV) {
    const imageFilenames = keepaProduct.imagesCSV.split(',');
    imageFilenames.forEach(filename => {
      const trimmed = filename.trim();
      if (trimmed) {
        images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
      }
    });
  }

  // Build aspects
  const aspects = {};
  if (keepaProduct.brand) aspects.Brand = [keepaProduct.brand];
  if (keepaProduct.model) aspects.Model = [keepaProduct.model];
  if (keepaProduct.color) aspects.Color = [keepaProduct.color];
  if (keepaProduct.manufacturer) aspects.Manufacturer = [keepaProduct.manufacturer];
  if (keepaProduct.partNumber) aspects.MPN = [keepaProduct.partNumber];
  
  // UPC
  if (keepaProduct.upcList && keepaProduct.upcList.length > 0) {
    aspects.UPC = [keepaProduct.upcList[0]];
  }

  return {
    title: keepaProduct.title ? keepaProduct.title.substring(0, 80) : '',
    description: keepaProduct.description || buildDescriptionFromFeatures(keepaProduct),
    brand: keepaProduct.brand || '',
    model: keepaProduct.model || '',
    images: images.slice(0, 12), // eBay max 12 images
    aspects: aspects
  };
}

/**
 * Build description from features if no main description
 */
function buildDescriptionFromFeatures(product) {
  if (product.features && product.features.length > 0) {
    let html = '<h3>Product Features</h3><ul>';
    product.features.forEach(feature => {
      html += `<li>${escapeHtml(feature)}</li>`;
    });
    html += '</ul>';
    return html;
  }
  return 'Product information available upon request.';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build eBay Inventory Item payload
 * @see https://developer.ebay.com/api-docs/sell/inventory/resources/inventory_item/methods/createOrReplaceInventoryItem
 */
function buildInventoryItem(ebayDraft, keepaProduct, condition, quantity) {
  const item = {
    availability: {
      shipToLocationAvailability: {
        quantity: quantity
      }
    },
    condition: mapCondition(condition),
    product: {
      title: ebayDraft.title,
      description: ebayDraft.description,
      aspects: ebayDraft.aspects,
      imageUrls: ebayDraft.images
    }
  };

  // Add brand if available
  if (ebayDraft.brand) {
    item.product.brand = ebayDraft.brand;
  }

  // Add UPC/EAN/ISBN if available (product identifiers)
  if (keepaProduct.upcList && keepaProduct.upcList.length > 0) {
    item.product.upc = [keepaProduct.upcList[0]];
  }
  if (keepaProduct.eanList && keepaProduct.eanList.length > 0) {
    item.product.ean = [keepaProduct.eanList[0]];
  }

  return item;
}

/**
 * Map condition string to eBay condition enum
 */
function mapCondition(condition) {
  const conditionMap = {
    'NEW': 'NEW',
    'LIKE_NEW': 'LIKE_NEW',
    'NEW_OTHER': 'NEW_OTHER',
    'NEW_WITH_DEFECTS': 'NEW_WITH_DEFECTS',
    'MANUFACTURER_REFURBISHED': 'MANUFACTURER_REFURBISHED',
    'CERTIFIED_REFURBISHED': 'CERTIFIED_REFURBISHED',
    'EXCELLENT_REFURBISHED': 'EXCELLENT_REFURBISHED',
    'VERY_GOOD_REFURBISHED': 'VERY_GOOD_REFURBISHED',
    'GOOD_REFURBISHED': 'GOOD_REFURBISHED',
    'SELLER_REFURBISHED': 'SELLER_REFURBISHED',
    'USED_EXCELLENT': 'USED_EXCELLENT',
    'USED_VERY_GOOD': 'USED_VERY_GOOD',
    'USED_GOOD': 'USED_GOOD',
    'USED_ACCEPTABLE': 'USED_ACCEPTABLE',
    'FOR_PARTS_OR_NOT_WORKING': 'FOR_PARTS_OR_NOT_WORKING'
  };
  
  return conditionMap[condition.toUpperCase()] || 'NEW';
}
