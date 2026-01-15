/**
 * Test Quick List Creation - creates test listings directly
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { decrypt } = require('./utils/encryption');
const { getCategorySuggestion } = require('./get-ebay-category-suggestion');
const { generateListingContent } = require('./generate-ebay-listing-content');
const fetch = require('node-fetch');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Pete's gmail user ID
const TEST_USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';

// Test ASINs - validated against Keepa with current prices
const TEST_ASINS = [
  'B09B8V1LZ3', // Echo Dot (newest) - $49.99
  'B09JQMJHXY', // AirPods Pro 1st Gen - $249.00
];

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const results = [];

  try {
    // Get user's quick list settings
    const { data: settings, error: settingsErr } = await supabase
      .from('quick_list_settings')
      .select('*')
      .eq('user_id', TEST_USER_ID)
      .single();

    if (!settings || settingsErr) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Quick List settings not configured', details: settingsErr?.message })
      };
    }

    // Get Keepa API key
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', TEST_USER_ID)
      .eq('service', 'keepa')
      .single();

    if (!keyData) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keepa API key not found' })
      };
    }

    // Try to decrypt, fall back to raw value if not encrypted
    let keepaKey = decrypt(keyData.api_key_encrypted);
    if (!keepaKey) {
      // Key might be stored unencrypted
      keepaKey = keyData.api_key_encrypted;
    }

    // Get eBay access token
    const accessToken = await getValidAccessToken(supabase, TEST_USER_ID);

    // Process each ASIN
    for (const asin of TEST_ASINS) {
      const result = { asin, status: 'pending' };
      const startTime = Date.now();
      
      try {
        // 1. Fetch from Keepa
        console.log(`[${asin}] Fetching from Keepa with key: ${keepaKey.substring(0,10)}...`);
        const keepaUrl = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180&offers=20`;
        const keepaResponse = await fetch(keepaUrl, {
          headers: { 'Accept-Encoding': 'gzip' }
        });
        
        const keepaText = await keepaResponse.text();
        console.log(`[${asin}] Keepa response length: ${keepaText.length}, starts with: ${keepaText.substring(0, 100)}`);
        
        let keepaData;
        try {
          keepaData = JSON.parse(keepaText);
        } catch (parseErr) {
          result.status = 'failed';
          result.error = `Keepa parse error: ${parseErr.message}, response: ${keepaText.substring(0, 200)}`;
          results.push(result);
          continue;
        }

        if (!keepaData.products || keepaData.products.length === 0) {
          result.status = 'failed';
          result.error = `Product not found on Keepa. Response: ${JSON.stringify(keepaData).substring(0, 200)}`;
          results.push(result);
          continue;
        }

        const product = keepaData.products[0];
        result.title = product.title?.substring(0, 60);

        // Get Amazon price and double it
        let amazonPrice = 29.99; // default
        if (product.stats?.current) {
          const p = product.stats.current[0] || product.stats.current[1];
          if (p > 0) amazonPrice = p / 100;
        }
        const listPrice = Math.round(amazonPrice * 2 * 100) / 100;
        result.amazonPrice = amazonPrice;
        result.listPrice = listPrice;

        // 2. Get category
        console.log(`[${asin}] Getting category...`);
        const categoryResult = await getCategorySuggestion(product.title);
        if (!categoryResult.categoryId) {
          result.status = 'failed';
          result.error = 'Failed to get category';
          results.push(result);
          continue;
        }
        result.category = categoryResult.categoryName;

        // 3. Generate AI content
        console.log(`[${asin}] Generating content...`);
        const aiContent = await generateListingContent({
          title: product.title,
          description: product.description || '',
          features: product.features || [],
          brand: product.brand || '',
          category: categoryResult.categoryName
        });

        // 4. Build inventory item
        const sku = `${settings.sku_prefix}${asin}`;
        result.sku = sku;

        const images = [];
        if (product.imagesCSV) {
          product.imagesCSV.split(',').forEach(f => {
            const trimmed = f.trim();
            if (trimmed) images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
          });
        }

        if (images.length === 0) {
          result.status = 'failed';
          result.error = 'No images available';
          results.push(result);
          continue;
        }

        const aspects = {};
        if (product.brand) aspects.Brand = [product.brand];
        if (product.model) aspects.Model = [product.model];
        if (product.partNumber) aspects.MPN = [product.partNumber];
        if (product.manufacturer) aspects.Manufacturer = [product.manufacturer];

        // Add description note if configured
        let description = aiContent.description;
        if (settings.description_note) {
          description += `<div style="margin-top:20px;padding-top:15px;border-top:1px solid #ddd;">${settings.description_note}</div>`;
        }

        const inventoryItem = {
          availability: { shipToLocationAvailability: { quantity: 1 } },
          condition: 'NEW',
          product: {
            title: aiContent.title,
            description: description,
            aspects,
            imageUrls: images.slice(0, 12)
          }
        };
        if (product.brand) inventoryItem.product.brand = product.brand;
        if (product.partNumber) inventoryItem.product.mpn = product.partNumber;
        if (product.upcList && product.upcList.length > 0) {
          inventoryItem.product.upc = [product.upcList[0]];
        }
        if (product.eanList && product.eanList.length > 0) {
          inventoryItem.product.ean = [product.eanList[0]];
        }

        // 5. Create inventory item
        console.log(`[${asin}] Creating inventory item...`);
        await ebayApiRequest(
          accessToken,
          `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
          { method: 'PUT', body: JSON.stringify(inventoryItem) }
        );

        // 6. Create offer
        console.log(`[${asin}] Creating offer...`);
        const offerPayload = {
          sku,
          marketplaceId: 'EBAY_US',
          format: 'FIXED_PRICE',
          availableQuantity: 1,
          categoryId: categoryResult.categoryId,
          listingPolicies: {
            fulfillmentPolicyId: settings.fulfillment_policy_id,
            paymentPolicyId: settings.payment_policy_id,
            returnPolicyId: settings.return_policy_id
          },
          pricingSummary: {
            price: { currency: 'USD', value: listPrice.toFixed(2) }
          },
          merchantLocationKey: settings.merchant_location_key
        };

        const offerResult = await ebayApiRequest(
          accessToken,
          '/sell/inventory/v1/offer',
          { method: 'POST', body: JSON.stringify(offerPayload) }
        );
        const offerId = offerResult.offerId;
        result.offerId = offerId;

        // 7. Publish
        console.log(`[${asin}] Publishing...`);
        const publishResult = await ebayApiRequest(
          accessToken,
          `/sell/inventory/v1/offer/${offerId}/publish`,
          { method: 'POST' }
        );
        
        result.listingId = publishResult.listingId;
        result.listingUrl = `https://www.ebay.com/itm/${publishResult.listingId}`;
        result.status = 'success';
        result.elapsedMs = Date.now() - startTime;

      } catch (err) {
        result.status = 'error';
        result.error = err.message;
        result.elapsedMs = Date.now() - startTime;
      }

      results.push(result);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        settings: {
          sku_prefix: settings.sku_prefix,
          location: settings.merchant_location_key
        },
        results
      }, null, 2)
    };

  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message, stack: error.stack })
    };
  }
};
