const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing current single listing flow\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // Get auth token
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Test with a product - Anker USB-C Hub
  console.log('Testing: Anker USB-C Hub (B087QTVCHH)');
  console.log('This will test the full flow:\n');
  console.log('1. Keepa fetch');
  console.log('2. Taxonomy API category');
  console.log('3. Aspect lookup + keyword matching');
  console.log('4. Inventory + Offer + Publish\n');

  const startTime = Date.now();
  
  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B087QTVCHH',
      price: '34.99',
      quantity: 1,
      condition: 'NEW',
      publish: false  // Don't actually publish, just test
    })
  });

  const elapsed = Date.now() - startTime;
  const result = await resp.json();
  
  console.log(`Response (${elapsed}ms):`);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log(`\n✅ SUCCESS - Offer created: ${result.offerId}`);
  } else if (result.error === 'Missing required aspects') {
    console.log(`\n⏳ LEARNING - Missing aspects logged: ${result.details?.missingAspects?.join(', ')}`);
  } else {
    console.log(`\n❌ FAILED: ${result.message || result.error}`);
  }
}

test().catch(console.error);
