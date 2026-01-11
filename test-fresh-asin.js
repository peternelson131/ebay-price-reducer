const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing with fresh ASIN\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Test: SanDisk 128GB microSD - B08GY9NYRM
  console.log('ASIN: B08GY9NYRM (SanDisk microSD)');
  console.log('Price: $19.99');
  console.log('Condition: NEW');
  console.log('Publish: false\n');
  
  const startTime = Date.now();
  
  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B08GY9NYRM',
      price: '19.99',
      quantity: 1,
      condition: 'NEW',
      publish: false
    })
  });

  const elapsed = Date.now() - startTime;
  const result = await resp.json();
  
  console.log(`Response (${elapsed}ms):`);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log(`\n✅ SUCCESS!`);
    console.log(`   Title: ${result.title}`);
    console.log(`   Category: ${result.category?.name} (${result.category?.id})`);
    console.log(`   SKU: ${result.sku}`);
    console.log(`   Offer ID: ${result.offerId}`);
  } else {
    console.log(`\n❌ FAILED: ${result.message || result.error}`);
  }
}

test().catch(console.error);
