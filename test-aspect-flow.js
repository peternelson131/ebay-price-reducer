const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing aspect keyword matching flow\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Test with Sony WH-1000XM5 (wireless over-ear headphones)
  console.log('Testing: Sony WH-1000XM5 Headphones');
  console.log('Expected: Type=Over-Ear, Connectivity=Wireless (from keywords)\n');

  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B0C8PQ63CV',  // Sony WH-1000XM5
      price: '349.99',
      quantity: 1,
      condition: 'NEW',
      publish: false  // Don't publish, just test
    })
  });

  const result = await resp.json();
  
  if (result.success) {
    console.log('✅ SUCCESS');
    console.log(`   Title: ${result.title}`);
    console.log(`   Category: ${result.category?.name}`);
    console.log(`   Offer ID: ${result.offerId}`);
  } else {
    console.log('❌ FAILED:', result.message || result.error);
  }

  // Check if any misses were logged
  console.log('\n📋 Checking ebay_aspect_misses table...');
  const { data: misses } = await supabase
    .from('ebay_aspect_misses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (misses?.length > 0) {
    console.log(`Found ${misses.length} logged misses:`);
    misses.forEach(m => {
      console.log(`   ${m.asin}: ${m.aspect_name} (${m.status})`);
      console.log(`      Title: ${m.product_title?.substring(0, 50)}...`);
    });
  } else {
    console.log('   No misses logged (all aspects matched!)');
  }
}

test().catch(console.error);
