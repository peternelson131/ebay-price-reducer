const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing via deployed API endpoints\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // Get auth token
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;
  const auth = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const sku = 'wi_B0C8PSMPTH';
  
  // Delete any existing offer/inventory first
  console.log('🧹 Cleaning up existing...');
  await fetch(`${API}/delete-ebay-offer`, { method: 'POST', headers: auth, body: JSON.stringify({ sku }) }).catch(() => {});
  await fetch(`${API}/delete-ebay-inventory-item`, { method: 'POST', headers: auth, body: JSON.stringify({ sku }) }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  // Create inventory
  console.log('📦 Creating inventory...');
  const inv = await (await fetch(`${API}/create-ebay-inventory-item`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({
      sku,
      title: 'Beats Studio Pro Wireless Headphones',
      description: 'Premium wireless headphones',
      brand: 'Beats',
      mpn: 'MQTR3LL/A',
      condition: 'NEW',
      quantity: 1,
      imageUrls: ['https://m.media-amazon.com/images/I/51mDF9jKPsL.jpg'],
      aspects: {
        Brand: ['Beats'],
        Model: ['MQTR3LL/A'],
        Type: ['Over-Ear'],
        Connectivity: ['Wireless'],
        Color: ['Sandstone']
      }
    })
  })).json();
  console.log('Inventory:', inv.success ? '✅' : `❌ ${inv.error}`);

  // Create offer
  console.log('📋 Creating offer...');
  const offer = await (await fetch(`${API}/create-ebay-offer`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ sku, price: '299.99', quantity: 1, categoryId: '112529' })
  })).json();
  console.log('Offer:', offer.success ? `✅ ${offer.offerId}` : `❌ ${offer.error}`);

  if (!offer.success) return;

  // Publish
  console.log('🚀 Publishing...');
  const pub = await (await fetch(`${API}/publish-ebay-offer`, {
    method: 'POST', headers: auth,
    body: JSON.stringify({ offerId: offer.offerId })
  })).json();
  
  if (pub.success) {
    console.log(`\n✅ SUCCESS! https://www.ebay.com/itm/${pub.listingId}`);
  } else {
    console.log(`❌ ${pub.error}`);
  }
}

test().catch(console.error);
