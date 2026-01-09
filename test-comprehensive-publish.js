const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// ALL diverse ASINs we found
const TEST_PRODUCTS = [
  // Original working
  { asin: 'B01KJEOCDW', category: 'Toy/Building', price: '27.99' },
  
  // From correlations
  { asin: 'B07CYVDSF4', category: 'Apparel/Socks', price: '14.99' },
  { asin: 'B01IIGVUQA', category: 'Grocery/Supplement', price: '24.99' },
  
  // New categories
  { asin: '1982181281', category: 'Book', price: '16.99' },
  { asin: 'B00FLYWNYQ', category: 'Kitchen', price: '89.99' },
  { asin: 'B000634MH8', category: 'Pet Products', price: '29.99' },
  { asin: 'B0002AT3TC', category: 'Pet Products', price: '19.99' },
  { asin: 'B00006IE8J', category: 'Office', price: '12.99' },
  { asin: 'B000CITK8S', category: 'Automotive', price: '29.99' },
  { asin: 'B003VWXZQ0', category: 'Home/Sewing', price: '199.99' },
];

async function test() {
  console.log('🧪 COMPREHENSIVE CATEGORY PUBLISH TEST\n');
  console.log('Testing ' + TEST_PRODUCTS.length + ' products across different categories\n');
  console.log('═'.repeat(80) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  const successes = [];
  const failures = [];

  for (const product of TEST_PRODUCTS) {
    process.stdout.write(`${product.category.padEnd(20)} (${product.asin})... `);
    
    try {
      const response = await fetch(`${API_BASE}/auto-list-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ asin: product.asin, price: product.price, publish: true })
      });

      const result = await response.json();
      
      if (result.success && result.listingId) {
        console.log(`✅ ${result.listingId}`);
        successes.push({
          asin: product.asin,
          category: product.category,
          ebayCategory: result.category?.name,
          listingId: result.listingId,
          url: result.listingUrl
        });
      } else {
        const errorShort = (result.message || result.error || '').substring(0, 60);
        console.log(`❌ ${errorShort}`);
        failures.push({
          asin: product.asin,
          category: product.category,
          error: result.message || result.error,
          ebayCategory: result.category?.name
        });
      }
    } catch (err) {
      console.log(`❌ ${err.message.substring(0, 60)}`);
      failures.push({ asin: product.asin, category: product.category, error: err.message });
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save detailed results
  const report = {
    timestamp: new Date().toISOString(),
    total: TEST_PRODUCTS.length,
    successes: { count: successes.length, items: successes },
    failures: { count: failures.length, items: failures }
  };
  fs.writeFileSync('category-test-results.json', JSON.stringify(report, null, 2));

  // Summary
  console.log('\n' + '═'.repeat(80));
  console.log(`\n📊 RESULTS: ${successes.length}/${TEST_PRODUCTS.length} succeeded\n`);
  
  if (successes.length > 0) {
    console.log('✅ SUCCESS (delete these listings):');
    successes.forEach(s => console.log(`   ${s.listingId}: ${s.category} → ${s.ebayCategory}`));
  }
  
  if (failures.length > 0) {
    console.log('\n❌ FAILURES (need fixes):');
    failures.forEach(f => {
      console.log(`\n   ${f.category} (${f.asin})`);
      console.log(`   eBay Category: ${f.ebayCategory || 'unknown'}`);
      console.log(`   Error: ${f.error}`);
    });
  }
  
  console.log('\n📁 Detailed results: category-test-results.json');
}

test().catch(console.error);
