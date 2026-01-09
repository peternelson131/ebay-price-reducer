const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Diverse ASINs to test real publishing
const TEST_PRODUCTS = [
  { asin: 'B01KJEOCDW', name: 'LEGO Dinosaur', category: 'Toys/Building', price: '27.99' },
  { asin: 'B09V3KXJPB', name: 'iPad Air', category: 'Tablet', price: '449.99' },
  { asin: 'B0C8PSMPTH', name: 'Beats Headphones', category: 'Electronics', price: '299.99' },
  { asin: 'B00005JNOG', name: 'Lost DVD', category: 'DVD', price: '19.99' },
  { asin: 'B07VGRJDFY', name: 'Nintendo Switch', category: 'Video Game Console', price: '299.99' },
];

async function test() {
  console.log('🧪 REAL PUBLISH TEST - Capturing Failures\n');
  console.log('This will create REAL listings. Each success must be manually deleted.\n');
  console.log('═'.repeat(80) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  const results = [];
  const failures = [];
  const successes = [];

  for (const product of TEST_PRODUCTS) {
    console.log(`\n📦 Testing: ${product.name} (${product.asin})`);
    console.log(`   Category: ${product.category}`);
    
    try {
      const response = await fetch(`${API_BASE}/auto-list-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          asin: product.asin,
          price: product.price,
          publish: true  // ACTUALLY PUBLISH
        })
      });

      const result = await response.json();
      
      if (result.success && result.listingId) {
        console.log(`   ✅ SUCCESS! Listing: ${result.listingId}`);
        console.log(`   🔗 ${result.listingUrl}`);
        successes.push({
          asin: product.asin,
          name: product.name,
          category: product.category,
          ebayCategoryId: result.category?.id,
          ebayCategoryName: result.category?.name,
          listingId: result.listingId,
          listingUrl: result.listingUrl
        });
      } else {
        console.log(`   ❌ FAILED: ${result.message || result.error}`);
        failures.push({
          asin: product.asin,
          name: product.name,
          category: product.category,
          error: result.message || result.error,
          fullResponse: result
        });
      }
      
      results.push({ ...product, result });
      
    } catch (err) {
      console.log(`   ❌ ERROR: ${err.message}`);
      failures.push({
        asin: product.asin,
        name: product.name,
        category: product.category,
        error: err.message
      });
    }
    
    // Small delay between requests
    await new Promise(r => setTimeout(r, 2000));
  }

  // Save results
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: TEST_PRODUCTS.length,
      successes: successes.length,
      failures: failures.length
    },
    successes,
    failures
  };

  fs.writeFileSync('publish-test-results.json', JSON.stringify(report, null, 2));

  // Print summary
  console.log('\n' + '═'.repeat(80));
  console.log('\n📊 SUMMARY\n');
  console.log(`✅ Successes: ${successes.length}`);
  console.log(`❌ Failures: ${failures.length}`);
  
  if (successes.length > 0) {
    console.log('\n🎉 SUCCESSFUL LISTINGS (need manual deletion):');
    successes.forEach(s => console.log(`   ${s.listingId}: ${s.name} - ${s.listingUrl}`));
  }
  
  if (failures.length > 0) {
    console.log('\n⚠️ FAILURES (need investigation):');
    failures.forEach(f => {
      console.log(`\n   ${f.asin}: ${f.name} (${f.category})`);
      console.log(`   Error: ${f.error}`);
    });
  }
  
  console.log('\n📁 Full results saved to: publish-test-results.json');
}

test().catch(console.error);
