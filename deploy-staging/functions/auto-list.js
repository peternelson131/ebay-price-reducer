/**
 * Auto-List: Single-step ASIN → eBay Listing
 * 
 * POST { asin, price?, quantity?, condition? }
 * 
 * Flow:
 * 1. Fetch product data from Keepa
 * 2. Create eBay inventory item
 * 3. Create eBay offer with user's policies
 * 4. Publish offer
 * 5. Return listing URL
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

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let sku = null;
  let offerId = null;
  let accessToken = null;
  let userId = null;

  try {
    console.log('🚀 Auto-list started');

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
    userId = user.id;

    // 2. Parse request
    const { asin, price, quantity = 1, condition, categoryId } = JSON.parse(event.body);

    if (!asin) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'ASIN is required' }) };
    }

    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid ASIN format' }) };
    }

    // 3. Get user settings
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select(`
        ebay_fulfillment_policy_id,
        ebay_payment_policy_id,
        ebay_return_policy_id,
        ebay_merchant_location_key,
        ebay_default_condition,
        ebay_sku_prefix,
        ebay_connection_status
      `)
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to get user settings' }) };
    }

    if (userData.ebay_connection_status !== 'connected') {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'eBay account not connected' }) };
    }

    // Validate required settings
    if (!userData.ebay_fulfillment_policy_id || !userData.ebay_payment_policy_id || 
        !userData.ebay_return_policy_id || !userData.ebay_merchant_location_key) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ 
          error: 'eBay settings incomplete. Please configure your shipping, payment, return policies and location in Settings.' 
        }) 
      };
    }

    // 4. Get Keepa API key
    const { data: keyData, error: keyError } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', userId)
      .eq('service', 'keepa')
      .single();

    if (keyError || !keyData) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Keepa API key not found' }) };
    }

    let keepaKey = keyData.api_key_encrypted;
    if (keepaKey.includes(':')) {
      keepaKey = decrypt(keepaKey);
    }

    // 5. Fetch Keepa data
    console.log(`📦 Fetching Keepa data for ${asin}...`);
    const keepaUrl = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180&offers=20`;
    const keepaResponse = await fetch(keepaUrl);
    const keepaData = await keepaResponse.json();

    if (!keepaData.products || keepaData.products.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `Product not found for ASIN: ${asin}` }) };
    }

    const product = keepaData.products[0];
    console.log(`✅ Got product: ${product.title?.substring(0, 50)}...`);

    // 6. Get eBay access token
    accessToken = await getValidAccessToken(supabase, userId);

    // 7. Generate SKU
    const skuPrefix = userData.ebay_sku_prefix || 'wi_';
    sku = `${skuPrefix}${asin}`;

    // 8. Build and create inventory item
    const images = extractImages(product);
    const aspects = buildAspects(product);

    console.log(`📝 Creating inventory item: ${sku}`);
    await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          availability: {
            shipToLocationAvailability: { quantity: quantity }
          },
          condition: condition || userData.ebay_default_condition || 'NEW',
          product: {
            title: product.title ? product.title.substring(0, 80) : 'Product',
            description: buildDescription(product),
            aspects: aspects,
            imageUrls: images.length > 0 ? images : undefined
          }
        })
      }
    );
    console.log('✅ Inventory item created');

    // 9. Create offer
    console.log('📋 Creating offer...');
    const listingPrice = price || calculateSuggestedPrice(product);

    const offerPayload = {
      sku: sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      categoryId: categoryId || '220', // Default to Toys & Hobbies
      listingPolicies: {
        fulfillmentPolicyId: userData.ebay_fulfillment_policy_id,
        paymentPolicyId: userData.ebay_payment_policy_id,
        returnPolicyId: userData.ebay_return_policy_id
      },
      pricingSummary: {
        price: {
          currency: 'USD',
          value: String(listingPrice)
        }
      },
      merchantLocationKey: userData.ebay_merchant_location_key
    };

    const { data: offerResult } = await ebayApiRequest(
      accessToken,
      '/sell/inventory/v1/offer',
      { method: 'POST', body: JSON.stringify(offerPayload) }
    );
    offerId = offerResult.offerId;
    console.log(`✅ Offer created: ${offerId}`);

    // 10. Publish offer
    console.log('🚀 Publishing...');
    const { data: publishResult } = await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/offer/${offerId}/publish`,
      { method: 'POST' }
    );

    const listingId = publishResult.listingId;
    const listingUrl = `https://www.ebay.com/itm/${listingId}`;

    console.log(`🎉 SUCCESS! Listing: ${listingUrl}`);

    // 11. Store in database for tracking
    await supabase.from('listings').insert({
      user_id: userId,
      asin: asin,
      ebay_item_id: listingId,
      sku: sku,
      current_price: listingPrice,
      status: 'active',
      title: product.title?.substring(0, 255)
    }).catch(e => console.log('Note: Could not store listing:', e.message));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        listing: {
          id: listingId,
          url: listingUrl,
          sku: sku,
          asin: asin,
          title: product.title?.substring(0, 80),
          price: listingPrice
        }
      })
    };

  } catch (error) {
    console.error('❌ Auto-list error:', error);

    // Attempt cleanup on failure
    if (accessToken) {
      try {
        if (offerId) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/offer/${offerId}`, { method: 'DELETE' }).catch(() => {});
        }
        if (sku) {
          await ebayApiRequest(accessToken, `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, { method: 'DELETE' }).catch(() => {});
        }
      } catch (cleanupError) {
        console.log('Cleanup error:', cleanupError.message);
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

function extractImages(product) {
  const images = [];
  
  if (product.imagesCSV) {
    product.imagesCSV.split(',').forEach(img => {
      const trimmed = img.trim();
      if (trimmed && images.length < 12) {
        images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
      }
    });
  }
  
  return images;
}

function buildAspects(product) {
  const aspects = {};
  
  if (product.brand) aspects.Brand = [product.brand];
  if (product.model) aspects.Model = [product.model];
  if (product.color) aspects.Color = [product.color];
  if (product.manufacturer) aspects.Manufacturer = [product.manufacturer];
  if (product.partNumber) aspects.MPN = [product.partNumber];
  
  return aspects;
}

function buildDescription(product) {
  let html = '';
  
  // Use Amazon description if available
  if (product.description) {
    html = product.description;
  } else if (product.features && product.features.length > 0) {
    html = '<h3>Features</h3><ul>';
    product.features.forEach(f => {
      html += `<li>${escapeHtml(f)}</li>`;
    });
    html += '</ul>';
  } else {
    html = `<p>${escapeHtml(product.title || 'Product listing')}</p>`;
  }
  
  // Add condition note (required per Pete's requirements)
  html += '<p><strong>Please see description for item condition details.</strong></p>';
  
  return html;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function calculateSuggestedPrice(product) {
  // Get Amazon price from Keepa data (prices are in cents)
  // csv[0] is Amazon price history, last value is current
  const amazonPrice = product.csv?.[0]?.[product.csv[0].length - 1];
  
  if (amazonPrice && amazonPrice > 0) {
    // Convert from cents and add margin
    const basePrice = amazonPrice / 100;
    return (basePrice * 1.3).toFixed(2); // 30% markup as default
  }
  
  return '29.99'; // Fallback price
}
