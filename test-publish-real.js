/**
 * Test: Real Publish Flow
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

const TEST_ASIN = 'B01KJEOCDW';  // LEGO Dinosaur
const TEST_PRICE = '29.99';

async function test() {
  console.log('🧪 Testing REAL Publish Flow\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const { data: userData } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'petenelson13@gmail.com')
    .single();

  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.email,
  });
  
  const { data: verifyData } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties?.hashed_token,
  });

  const authToken = verifyData.session.access_token;

  // Step 1: Create Inventory Item
  console.log('📦 Creating inventory item...');
  const item = await fetch(`${API_BASE}/create-ebay-inventory-item`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ asin: TEST_ASIN, condition: 'NEW', quantity: 1 })
  }).then(r => r.json());
  
  if (!item.success) { console.error('❌', item); return; }
  console.log(`   ✅ SKU: ${item.sku}`);

  // Step 2: Create Offer
  console.log('📋 Creating offer...');
  const offer = await fetch(`${API_BASE}/create-ebay-offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ sku: item.sku, price: TEST_PRICE, quantity: 1, categoryHint: 'building_toys' })
  }).then(r => r.json());
  
  if (!offer.success) { console.error('❌', offer); return; }
  console.log(`   ✅ Offer ID: ${offer.offerId}`);

  // Step 3: PUBLISH!
  console.log('🚀 Publishing offer...');
  const publish = await fetch(`${API_BASE}/publish-ebay-offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ offerId: offer.offerId })
  }).then(r => r.json());

  if (!publish.success) {
    console.error('❌ Publish failed:', JSON.stringify(publish, null, 2));
    // Cleanup
    await fetch(`${API_BASE}/delete-ebay-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ offerId: offer.offerId })
    });
    await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ sku: item.sku })
    });
    console.log('🧹 Cleaned up after failure');
    return;
  }

  console.log('\n' + '═'.repeat(50));
  console.log('✅ LISTING CREATED!');
  console.log(`   Listing ID: ${publish.listingId}`);
  console.log(`   URL: ${publish.listingUrl}`);
  console.log('═'.repeat(50));
  console.log('\n⚠️  Pete: Please delete this listing manually in Seller Hub');
}

test().catch(console.error);
