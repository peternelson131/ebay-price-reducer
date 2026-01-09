const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Test products for each category
const TESTS = [
  { asin: 'B01KJEOCDW', name: 'LEGO Dinosaur', price: '27.99', expectedCat: '19006' },
  { asin: 'B0C8PSMPTH', name: 'Beats Headphones', price: '299.99', expectedCat: '112529' },
  { asin: 'B00FLYWNYQ', name: 'Instant Pot', price: '89.99', expectedCat: '260311' },
  { asin: 'B0CQXCPFHT', name: 'PS5 Spider-Man 2', price: '49.99', expectedCat: '139973' },
  { asin: 'B0CL61F39H', name: 'PS5 Console', price: '449.99', expectedCat: '139971' },
];

async function test() {
  console.log('🧪 Testing all 5 categories in database\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // Get auth
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Get categories from DB
  const { data: categories } = await supabase.from('ebay_category_aspects').select('*');
  console.log('Categories in DB:');
  categories.forEach(c => console.log(`  ${c.category_id}: ${c.category_name} → [${c.required_aspects.join(', ')}]`));
  console.log('');

  const results = [];

  for (const t of TESTS) {
    console.log(`Testing: ${t.name} (${t.asin})`);
    
    const resp = await fetch(`${API}/auto-list-single`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ asin: t.asin, price: t.price, quantity: 1, condition: 'NEW', publish: true })
    });

    const result = await resp.json();
    
    if (result.success) {
      const catMatch = result.category?.id === t.expectedCat ? '✅' : `⚠️ expected ${t.expectedCat}`;
      console.log(`  ✅ SUCCESS`);
      console.log(`     Category: ${result.category?.name} (${result.category?.id}) ${catMatch}`);
      console.log(`     Listing: ${result.listingId}`);
      results.push({ name: t.name, success: true, listingId: result.listingId, category: result.category?.id });
    } else {
      console.log(`  ❌ FAILED: ${result.message || result.error}`);
      results.push({ name: t.name, success: false, error: result.message || result.error });
    }
    console.log('');
    
    await new Promise(r => setTimeout(r, 2000));
  }

  console.log('\n📊 Summary:');
  console.log('─'.repeat(50));
  results.forEach(r => {
    if (r.success) {
      console.log(`✅ ${r.name} → ${r.listingId}`);
    } else {
      console.log(`❌ ${r.name} → ${r.error}`);
    }
  });
  
  console.log('\n🗑️ Listings to delete:');
  results.filter(r => r.success).forEach(r => {
    console.log(`   https://www.ebay.com/itm/${r.listingId}`);
  });
}

test().catch(console.error);
