const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

const TEST_PRODUCTS = [
  { asin: 'B01KJEOCDW', expected: 'Toy/Building', price: '24.99' },
  { asin: 'B09V3KXJPB', expected: 'Tablet', price: '449.99' },
  { asin: 'B0C8PSMPTH', expected: 'Electronics', price: '299.99' },
  { asin: 'B00005JNOG', expected: 'DVD', price: '19.99' },
  { asin: 'B07VGRJDFY', expected: 'Video Game Console', price: '299.99' },
];

async function test() {
  console.log('🧪 Category Detection Test v2\n');
  console.log('═'.repeat(80) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  const results = [];

  for (const product of TEST_PRODUCTS) {
    process.stdout.write(`Testing ${product.asin} (${product.expected})... `);
    
    try {
      const response = await fetch(`${API_BASE}/auto-list-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ asin: product.asin, price: product.price, publish: false })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`✅ → ${result.category.name} [${result.category.matchType}]`);
        results.push({ ...product, category: result.category.name, matchType: result.category.matchType, success: true });

        // Cleanup
        await fetch(`${API_BASE}/delete-ebay-offer`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ offerId: result.offerId })
        });
        await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ sku: result.sku })
        });
      } else {
        console.log(`❌ ${result.message?.substring(0, 50) || result.error}`);
        results.push({ ...product, error: result.message || result.error, success: false });
      }
    } catch (err) {
      console.log(`❌ ${err.message}`);
      results.push({ ...product, error: err.message, success: false });
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 RESULTS\n');
  
  const passed = results.filter(r => r.success).length;
  const defaultMatches = results.filter(r => r.matchType === 'default').length;
  
  for (const r of results) {
    const status = r.success ? (r.matchType === 'default' ? '⚠️' : '✅') : '❌';
    const detail = r.success ? `${r.category} [${r.matchType}]` : r.error?.substring(0, 40);
    console.log(`${status} ${r.asin} | Expected: ${r.expected.padEnd(18)} | Got: ${detail}`);
  }
  
  console.log(`\n✅ ${passed}/${results.length} succeeded`);
  if (defaultMatches > 0) {
    console.log(`⚠️  ${defaultMatches} fell back to default category (may need mapping added)`);
  }
}

test().catch(console.error);
