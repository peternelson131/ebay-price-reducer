const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

const ASIN = 'B0C8PSMPTH';
const PRICE = '299.99';
const SKU = `wi_${ASIN}`;
const CATEGORY_ID = '112529';

async function test() {
  console.log('🧪 Testing Headphones listing\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // 1. Get required aspects
  const { data: catData } = await supabase.from('ebay_category_aspects').select('required_aspects').eq('category_id', CATEGORY_ID).single();
  console.log(`Required aspects: ${catData.required_aspects.join(', ')}\n`);

  // 2. Get Keepa data
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);
  
  const product = (await (await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${ASIN}&stats=180`)).json()).products[0];
  console.log(`Product: ${product.title?.substring(0, 50)}...`);
  console.log(`From Keepa: Brand=${product.brand}, Model=${product.model}, Color=${product.color}\n`);

  // 3. Build aspects
  const aspects = {
    Brand: [product.brand || 'Unbranded'],
    Model: [product.model || 'Unknown'],
    Type: ['Over-Ear'],
    Connectivity: ['Wireless'],
    Color: [product.color || 'Black']
  };
  console.log('Aspects:', aspects);

  // 4. Get token
  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshToken = decrypt(user.ebay_refresh_token);
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokens = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory' })
  })).json();

  const images = product.imagesCSV?.split(',').filter(f => f.trim()).map(f => `https://m.media-amazon.com/images/I/${f.trim()}`).slice(0, 12) || [];

  // 5. Create inventory
  console.log('\n📤 Creating inventory item...');
  let resp = await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${SKU}`, {
    method: 'PUT',
    headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      availability: { shipToLocationAvailability: { quantity: 1 } },
      condition: 'NEW',
      product: { title: product.title?.substring(0, 80), description: 'See photos.', aspects, imageUrls: images, brand: product.brand, mpn: product.partNumber }
    })
  });
  if (!resp.ok) { console.log('❌', await resp.json()); return; }
  console.log('✅ Inventory created');

  // 6. Create offer
  console.log('📤 Creating offer...');
  resp = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1, categoryId: CATEGORY_ID,
      listingPolicies: { fulfillmentPolicyId: '107540197026', paymentPolicyId: '243561626026', returnPolicyId: '243561625026' },
      pricingSummary: { price: { currency: 'USD', value: PRICE } },
      merchantLocationKey: 'loc-94e1f3a0-6e1b-4d23-befc-750fe183'
    })
  });
  const offer = await resp.json();
  if (!resp.ok) { console.log('❌', offer); return; }
  console.log(`✅ Offer: ${offer.offerId}`);

  // 7. Publish
  console.log('🚀 Publishing...');
  resp = await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}/publish`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${tokens.access_token}` }
  });
  const pub = await resp.json();
  if (!resp.ok) { console.log('❌', pub); return; }
  
  console.log(`\n✅ SUCCESS! https://www.ebay.com/itm/${pub.listingId}`);
}

test().catch(console.error);
