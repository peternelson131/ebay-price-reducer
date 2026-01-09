const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing cleaned up listing flow\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Test with a fresh ASIN - Logitech Mouse
  console.log('Testing: Logitech MX Master 3S (B09HM94VDS)');
  
  const startTime = Date.now();
  
  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B09HM94VDS',
      price: '99.99',
      quantity: 1,
      condition: 'NEW',
      publish: false
    })
  });

  const elapsed = Date.now() - startTime;
  const result = await resp.json();
  
  console.log(`\nResponse (${elapsed}ms):`);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log(`\n✅ SUCCESS!`);
    console.log(`   Category: ${result.category?.name} (${result.category?.id})`);
    console.log(`   Match type: ${result.category?.matchType}`);
  } else if (result.error === 'Missing required aspects') {
    console.log(`\n⏳ LEARNING - Missing: ${result.details?.missingAspects?.join(', ')}`);
  } else {
    console.log(`\n❌ FAILED: ${result.message || result.error}`);
  }
}

test().catch(console.error);
