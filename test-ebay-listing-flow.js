/**
 * Test Script: Full eBay Listing Flow
 * 
 * Tests: Inventory Item → Offer → Publish → Cleanup
 * Price set to 5x value to prevent accidental purchases
 * 
 * Usage: node test-ebay-listing-flow.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');
const crypto = require('crypto');

// Config
const TEST_ASIN = 'B01KJEOCDW'; // LEGO Dinosaur
const SKU_PREFIX = 'wi_test_';
const PRICE_MULTIPLIER = 5; // 5x actual price for safety

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(encryptedData) {
  if (!ENCRYPTION_KEY || !encryptedData) return null;
  try {
    const parts = encryptedData.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('Decryption error:', error.message);
    return null;
  }
}

async function refreshEbayToken(userId, clientId, clientSecret, refreshToken) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory'
    })
  });

  const data = await response.json();
  
  if (!response.ok) {
    console.error('Token refresh failed:', data);
    throw new Error(data.error_description || 'Token refresh failed');
  }

  return data.access_token;
}

async function ebayRequest(accessToken, endpoint, options = {}) {
  const url = `https://api.ebay.com${endpoint}`;
  
  console.log(`  📡 ${options.method || 'GET'} ${endpoint}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Content-Language': 'en-US',
      ...options.headers
    }
  });

  const contentType = response.headers.get('content-type');
  let data;
  
  if (contentType && contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    console.error(`  ❌ eBay API Error (${response.status}):`, JSON.stringify(data, null, 2));
    throw new Error(`eBay API error: ${JSON.stringify(data)}`);
  }

  return { data, status: response.status };
}

async function main() {
  console.log('🧪 eBay Listing Flow Test\n');
  console.log('='.repeat(50));

  let sku = null;
  let offerId = null;
  let listingId = null;
  let accessToken = null;

  try {
    // Step 1: Get user with eBay credentials
    console.log('\n📋 Step 1: Getting user credentials...');
    
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, email, ebay_client_id, ebay_client_secret, ebay_refresh_token')
      .not('ebay_refresh_token', 'is', null)
      .limit(1);

    if (userError || !users || users.length === 0) {
      throw new Error('No user with eBay credentials found');
    }

    const user = users[0];
    console.log(`  ✅ Found user: ${user.email}`);

    // Decrypt credentials
    const clientId = decrypt(user.ebay_client_id);
    const clientSecret = decrypt(user.ebay_client_secret);
    const refreshToken = decrypt(user.ebay_refresh_token);

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Failed to decrypt eBay credentials');
    }
    console.log('  ✅ Decrypted credentials');

    // Step 2: Get access token
    console.log('\n📋 Step 2: Getting eBay access token...');
    accessToken = await refreshEbayToken(user.id, clientId, clientSecret, refreshToken);
    console.log('  ✅ Got access token');

    // Step 3: Fetch Keepa data
    console.log('\n📋 Step 3: Fetching product data from Keepa...');
    
    const { data: keyData } = await supabase
      .from('user_api_keys')
      .select('api_key_encrypted')
      .eq('user_id', user.id)
      .eq('service', 'keepa')
      .single();

    // Keepa key might be stored unencrypted or encrypted
    let keepaKey = keyData.api_key_encrypted;
    if (keepaKey.includes(':')) {
      // It's encrypted, decrypt it
      keepaKey = decrypt(keepaKey);
    }
    // Otherwise it's stored in plain text
    const keepaUrl = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${TEST_ASIN}&stats=180`;
    
    const keepaResponse = await fetch(keepaUrl);
    const keepaData = await keepaResponse.json();
    
    if (!keepaData.products || keepaData.products.length === 0) {
      throw new Error('Product not found in Keepa');
    }

    const product = keepaData.products[0];
    console.log(`  ✅ Got product: ${product.title?.substring(0, 50)}...`);

    // Calculate safe test price (5x)
    // Keepa prices are in cents, -1 means no price
    const currentPrice = product.csv?.[0]?.[product.csv[0].length - 1];
    const basePrice = currentPrice > 0 ? currentPrice / 100 : 29.99;
    const testPrice = (basePrice * PRICE_MULTIPLIER).toFixed(2);
    console.log(`  💰 Base price: $${basePrice.toFixed(2)} → Test price: $${testPrice}`);

    // Step 4: Create Inventory Item
    console.log('\n📋 Step 4: Creating eBay Inventory Item...');
    
    sku = `${SKU_PREFIX}${TEST_ASIN}_${Date.now()}`;
    console.log(`  📝 SKU: ${sku}`);

    // Extract images
    const images = [];
    if (product.imagesCSV) {
      product.imagesCSV.split(',').slice(0, 12).forEach(img => {
        if (img.trim()) {
          images.push(`https://m.media-amazon.com/images/I/${img.trim()}`);
        }
      });
    }

    const inventoryItem = {
      availability: {
        shipToLocationAvailability: {
          quantity: 1
        }
      },
      condition: 'NEW',
      product: {
        title: product.title ? product.title.substring(0, 80) : 'Test Product',
        description: product.description || '<p>Test product listing - will be deleted</p>',
        aspects: {
          Brand: [product.brand || 'Unbranded']
        },
        imageUrls: images.length > 0 ? images : ['https://via.placeholder.com/500']
      }
    };

    // Add UPC if available
    if (product.upcList && product.upcList.length > 0) {
      inventoryItem.product.upc = [product.upcList[0]];
    }

    const { status: invStatus } = await ebayRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      { method: 'PUT', body: JSON.stringify(inventoryItem) }
    );
    
    console.log(`  ✅ Inventory item created (status: ${invStatus})`);

    // Step 5: Create Offer
    console.log('\n📋 Step 5: Creating eBay Offer...');

    // First, we need to get the user's fulfillment policies
    console.log('  🔍 Getting fulfillment policies...');
    const { data: policies } = await ebayRequest(
      accessToken,
      '/sell/account/v1/fulfillment_policy?marketplace_id=EBAY_US'
    );
    
    if (!policies.fulfillmentPolicies || policies.fulfillmentPolicies.length === 0) {
      throw new Error('No fulfillment policies found. Please create shipping policies in eBay Seller Hub.');
    }
    
    const fulfillmentPolicyId = policies.fulfillmentPolicies[0].fulfillmentPolicyId;
    console.log(`  ✅ Using fulfillment policy: ${fulfillmentPolicyId}`);

    // Get payment policies
    console.log('  🔍 Getting payment policies...');
    const { data: paymentPolicies } = await ebayRequest(
      accessToken,
      '/sell/account/v1/payment_policy?marketplace_id=EBAY_US'
    );
    
    if (!paymentPolicies.paymentPolicies || paymentPolicies.paymentPolicies.length === 0) {
      throw new Error('No payment policies found.');
    }
    
    const paymentPolicyId = paymentPolicies.paymentPolicies[0].paymentPolicyId;
    console.log(`  ✅ Using payment policy: ${paymentPolicyId}`);

    // Get return policies
    console.log('  🔍 Getting return policies...');
    const { data: returnPolicies } = await ebayRequest(
      accessToken,
      '/sell/account/v1/return_policy?marketplace_id=EBAY_US'
    );
    
    if (!returnPolicies.returnPolicies || returnPolicies.returnPolicies.length === 0) {
      throw new Error('No return policies found.');
    }
    
    const returnPolicyId = returnPolicies.returnPolicies[0].returnPolicyId;
    console.log(`  ✅ Using return policy: ${returnPolicyId}`);

    // Create the offer
    const offer = {
      sku: sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: '220', // Toys & Hobbies (generic for testing)
      listingDescription: product.description || '<p>Test listing - will be deleted shortly</p>',
      listingPolicies: {
        fulfillmentPolicyId: fulfillmentPolicyId,
        paymentPolicyId: paymentPolicyId,
        returnPolicyId: returnPolicyId
      },
      pricingSummary: {
        price: {
          currency: 'USD',
          value: testPrice
        }
      },
      merchantLocationKey: null // Will use default location
    };

    // Get merchant location
    console.log('  🔍 Getting merchant locations...');
    const { data: locations } = await ebayRequest(
      accessToken,
      '/sell/inventory/v1/location'
    );

    if (locations.locations && locations.locations.length > 0) {
      offer.merchantLocationKey = locations.locations[0].merchantLocationKey;
      console.log(`  ✅ Using location: ${offer.merchantLocationKey}`);
    } else {
      console.log('  ⚠️ No merchant location found - offer may fail');
    }

    const { data: offerResult } = await ebayRequest(
      accessToken,
      '/sell/inventory/v1/offer',
      { method: 'POST', body: JSON.stringify(offer) }
    );

    offerId = offerResult.offerId;
    console.log(`  ✅ Offer created: ${offerId}`);

    // Step 6: Publish Offer
    console.log('\n📋 Step 6: Publishing Offer...');

    const { data: publishResult } = await ebayRequest(
      accessToken,
      `/sell/inventory/v1/offer/${offerId}/publish`,
      { method: 'POST' }
    );

    listingId = publishResult.listingId;
    console.log(`  ✅ Listing published!`);
    console.log(`  🔗 Listing ID: ${listingId}`);
    console.log(`  🔗 URL: https://www.ebay.com/itm/${listingId}`);

    // Step 7: Verify listing exists
    console.log('\n📋 Step 7: Verifying listing...');
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

    const { data: offerDetails } = await ebayRequest(
      accessToken,
      `/sell/inventory/v1/offer/${offerId}`
    );
    
    console.log(`  ✅ Listing status: ${offerDetails.status}`);
    console.log(`  💰 Listed price: $${offerDetails.pricingSummary?.price?.value}`);

    console.log('\n' + '='.repeat(50));
    console.log('✅ FULL FLOW TEST SUCCESSFUL!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    console.error(error.stack);
  } finally {
    // Cleanup
    console.log('\n📋 Cleanup: Removing test data...');
    
    if (accessToken) {
      try {
        if (offerId) {
          // First withdraw/end the listing
          console.log(`  🗑️ Withdrawing offer: ${offerId}`);
          try {
            await ebayRequest(
              accessToken,
              `/sell/inventory/v1/offer/${offerId}/withdraw`,
              { method: 'POST' }
            );
            console.log('  ✅ Offer withdrawn');
          } catch (e) {
            console.log(`  ⚠️ Could not withdraw offer: ${e.message}`);
          }
          
          // Delete the offer
          console.log(`  🗑️ Deleting offer: ${offerId}`);
          try {
            await ebayRequest(
              accessToken,
              `/sell/inventory/v1/offer/${offerId}`,
              { method: 'DELETE' }
            );
            console.log('  ✅ Offer deleted');
          } catch (e) {
            console.log(`  ⚠️ Could not delete offer: ${e.message}`);
          }
        }
        
        if (sku) {
          console.log(`  🗑️ Deleting inventory item: ${sku}`);
          try {
            await ebayRequest(
              accessToken,
              `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
              { method: 'DELETE' }
            );
            console.log('  ✅ Inventory item deleted');
          } catch (e) {
            console.log(`  ⚠️ Could not delete inventory item: ${e.message}`);
          }
        }
      } catch (cleanupError) {
        console.error('  ❌ Cleanup error:', cleanupError.message);
      }
    }
    
    console.log('\n🏁 Test complete');
  }
}

main();
