const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// ASINs with known Keepa data
const TEST_PRODUCTS = [
  { asin: 'B0C8PSMPTH', category: 'Electronics/Headphones', price: '299.99' },
  { asin: 'B00FLYWNYQ', category: 'Kitchen', price: '89.99' },
  { asin: 'B00005JNOG', category: 'DVD', price: '19.99' },
];

async function test() {
  console.log('🧪 Testing Leaf Category Selection\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  for (const product of TEST_PRODUCTS) {
    console.log(`Testing ${product.category} (${product.asin})...`);
    
    const response = await fetch(`${API_BASE}/auto-list-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ asin: product.asin, price: product.price, publish: true })
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`  ✅ SUCCESS: ${result.category?.name} (${result.category?.id}) [${result.category?.matchType}]`);
      console.log(`     Listing: ${result.listingId} - ${result.listingUrl}`);
    } else {
      console.log(`  ❌ FAILED: ${result.message || result.error}`);
      if (result.category) {
        console.log(`     Category tried: ${result.category?.name} (${result.category?.id})`);
      }
    }
    console.log('');
    
    await new Promise(r => setTimeout(r, 2000));
  }
}

test().catch(console.error);
