const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

const ASIN = 'B0C8PSMPTH';  // Beats headphones
const PRICE = '299.99';
const SKU = `wi_${ASIN}`;
const CATEGORY_ID = '112529';  // Headphones

async function test() {
  console.log('🧪 Testing Headphones listing with required aspects from DB\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // 1. Get required aspects from our table
  console.log('📋 Looking up required aspects for category 112529...');
  const { data: catData } = await supabase
    .from('ebay_category_aspects')
    .select('required_aspects')
    .eq('category_id', CATEGORY_ID)
    .single();
  
  console.log(`   Required: ${catData.required_aspects.join(', ')}\n`);

  // 2. Get Keepa data
  console.log('📦 Fetching product from Keepa...');
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);
  
  const keepaResp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${ASIN}&stats=180`);
  const keepaData = await keepaResp.json();
  const product = keepaData.products[0];
  
  console.log(`   Title: ${product.title?.substring(0, 50)}...`);
  console.log(`   Brand: ${product.brand}`);
  console.log(`   Model: ${product.model}`);
  console.log(`   Color: ${product.color}\n`);

  // 3. Build aspects - from Keepa + defaults for missing
  const aspects = {};
  
  for (const aspectName of catData.required_aspects) {
    if (aspectName === 'Brand' && product.brand) {
      aspects.Brand = [product.brand];
    } else if (aspectName === 'Model' && product.model) {
      aspects.Model = [product.model];
    } else if (aspectName === 'Color' && product.color) {
      aspects.Color = [product.color];
    } else if (aspectName === 'Type') {
      aspects.Type = ['Over-Ear'];  // Default
    } else if (aspectName === 'Connectivity') {
      aspects.Connectivity = ['Wireless'];  // Default
    } else {
      console.log(`   ⚠️ Missing value for: ${aspectName}`);
    }
  }
  
  console.log('📋 Aspects to submit:', JSON.stringify(aspects, null, 2));

  // 4. Get eBay token
  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshToken = decrypt(user.ebay_refresh_token);
  
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokens = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory' })
  }).then(r => r.json());

  // 5. Build inventory item
  const images = product.imagesCSV?.split(',').filter(f => f.trim()).map(f => `https://m.media-amazon.com/images/I/${f.trim()}`) || [];
  
  const inventoryItem = {
    availability: { shipToLocationAvailability: { quantity: 1 } },
    condition: 'NEW',
    product: {
      title: product.title?.substring(0, 80),
      description: product.description?.substring(0, 4000) || 'See photos.',
      aspects,
      imageUrls: images.slice(0, 12),
      brand: product.brand,
      mpn: product.partNumber
    }
  };

  // 6. Create inventory item
  console.log('\n📤 Creating inventory item...');
  let resp = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json',  },
    body: JSON.stringify(inventoryItem)
  });
  
  if (!resp.ok) {
    const err = await resp.json();
    console.log('❌ Inventory error:', JSON.stringify(err, null, 2));
    return;
  }
  console.log('✅ Inventory item created');

  // 7. Create offer
  console.log('📤 Creating offer...');
  resp = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json',  },
    body: JSON.stringify({
      sku: SKU,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: CATEGORY_ID,
      listingPolicies: {
        fulfillmentPolicyId: '107540197026',
        paymentPolicyId: '243561626026',
        returnPolicyId: '243561625026'
      },
      pricingSummary: { price: { currency: 'USD', value: PRICE } },
      merchantLocationKey: 'loc-94e1f3a0-6e1b-4d23-befc-750fe183'
    })
  });
  
  const offerData = await resp.json();
  if (!resp.ok) {
    console.log('❌ Offer error:', JSON.stringify(offerData, null, 2));
    return;
  }
  console.log(`✅ Offer created: ${offerData.offerId}`);

  // 8. Publish
  console.log('🚀 Publishing...');
  resp = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offerData.offerId}/publish`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
  });
  
  const pubData = await resp.json();
  if (!resp.ok) {
    console.log('❌ Publish error:', JSON.stringify(pubData, null, 2));
    return;
  }
  
  console.log(`\n✅ SUCCESS!`);
  console.log(`   Listing: ${pubData.listingId}`);
  console.log(`   URL: https://www.ebay.com/itm/${pubData.listingId}`);
}

test().catch(console.error);
