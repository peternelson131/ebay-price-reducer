const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing aspect keyword matching\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Test with Beats Studio Pro (has images)
  console.log('Testing: Beats Studio Pro (B0C8PSMPTH)');
  console.log('Expected aspects from keywords: Type, Connectivity\n');

  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B0C8PSMPTH',
      price: '299.99',
      quantity: 1,
      condition: 'NEW',
      publish: false  // Don't publish
    })
  });

  const result = await resp.json();
  
  if (result.success) {
    console.log('✅ SUCCESS');
    console.log(`   Title: ${result.title}`);
    console.log(`   Category: ${result.category?.name} (${result.category?.id})`);
    console.log(`   Offer ID: ${result.offerId}`);
    console.log(`\n   (Not published - just testing)`);
  } else {
    console.log('❌ FAILED:', result.message || result.error);
  }

  // Check misses
  console.log('\n📋 Misses logged:');
  const { data: misses } = await supabase.from('ebay_aspect_misses').select('*').eq('asin', 'B0C8PSMPTH');
  if (misses?.length > 0) {
    misses.forEach(m => console.log(`   ${m.aspect_name}: "${m.product_title?.substring(0, 40)}..."`));
  } else {
    console.log('   None! All aspects matched.');
  }
}

test().catch(console.error);
