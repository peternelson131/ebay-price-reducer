const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing Aspect Inference\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  // Test headphones - should now have Connectivity
  console.log('Testing Headphones (B0C8PSMPTH)...');
  
  const response = await fetch(`${API_BASE}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({ asin: 'B0C8PSMPTH', price: '299.99', publish: true })
  });

  const result = await response.json();
  
  if (result.success) {
    console.log(`✅ SUCCESS!`);
    console.log(`   Category: ${result.category?.name} (${result.category?.id})`);
    console.log(`   Listing: ${result.listingId}`);
    console.log(`   URL: ${result.listingUrl}`);
  } else {
    console.log(`❌ FAILED: ${result.message || result.error}`);
  }
}

test().catch(console.error);
