const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

const ASIN = 'B0C8PSMPTH';
const SKU = `wi_${ASIN}`;
const CATEGORY_ID = '112529';

async function test() {
  console.log('🧪 Testing Headphones (112529) with aspects from DB\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // 1. Get required aspects from DB
  const { data: catData } = await supabase.from('ebay_category_aspects').select('required_aspects').eq('category_id', CATEGORY_ID).single();
  console.log(`📋 Required: ${catData.required_aspects.join(', ')}`);

  // 2. Get product
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const product = (await (await fetch(`https://api.keepa.com/product?key=${decrypt(keyData.api_key_encrypted)}&domain=1&asin=${ASIN}&stats=180`)).json()).products[0];
  console.log(`📦 ${product.title?.substring(0, 50)}...\n`);

  // 3. Build aspects from DB requirements + Keepa data
  const aspects = {};
  for (const name of catData.required_aspects) {
    if (name === 'Brand') aspects.Brand = [product.brand || 'Unbranded'];
    else if (name === 'Model') aspects.Model = [product.model || 'Unknown'];
    else if (name === 'Color') aspects.Color = [product.color || 'Black'];
    else if (name === 'Type') aspects.Type = ['Over-Ear'];
    else if (name === 'Connectivity') aspects.Connectivity = ['Wireless'];
  }
  console.log('Aspects:', JSON.stringify(aspects));

  // 4. eBay token
  const creds = Buffer.from(`${decrypt(user.ebay_client_id)}:${decrypt(user.ebay_client_secret)}`).toString('base64');
  const tokens = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypt(user.ebay_refresh_token), scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory' })
  })).json();
  const auth = { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' };

  const images = product.imagesCSV?.split(',').filter(f=>f.trim()).map(f=>`https://m.media-amazon.com/images/I/${f.trim()}`).slice(0,12)||[];

  // 5. Create inventory
  console.log('\n📤 Creating inventory...');
  await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(SKU)}`, {
    method: 'PUT', headers: {...auth, 'Accept-Language': 'en-US', 'Content-Language': 'en-US'},
    body: JSON.stringify({ availability: { shipToLocationAvailability: { quantity: 1 } }, condition: 'NEW',
      product: { title: product.title?.substring(0,80), description: 'See photos.', aspects, imageUrls: images, brand: product.brand, mpn: product.partNumber }
    })
  });
  console.log('✅ Inventory');

  // 6. Create offer (no language headers)
  console.log('📤 Creating offer...');
  const offer = await (await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST', headers: auth,
    body: JSON.stringify({ sku: SKU, marketplaceId: 'EBAY_US', format: 'FIXED_PRICE', availableQuantity: 1, categoryId: CATEGORY_ID,
      listingPolicies: { fulfillmentPolicyId: '107540197026', paymentPolicyId: '243561626026', returnPolicyId: '243561625026' },
      pricingSummary: { price: { currency: 'USD', value: '299.99' } }, merchantLocationKey: 'loc-94e1f3a0-6e1b-4d23-befc-750fe183'
    })
  })).json();
  if (offer.errors) { console.log('❌', offer.errors[0].message); return; }
  console.log(`✅ Offer: ${offer.offerId}`);

  // 7. Publish
  console.log('🚀 Publishing...');
  const pub = await (await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}/publish`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${tokens.access_token}` }
  })).json();
  if (pub.errors) { console.log('❌', pub.errors[0].message); return; }
  
  console.log(`\n✅ SUCCESS!\n   https://www.ebay.com/itm/${pub.listingId}`);
}

test().catch(console.error);
