const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Different product categories to test
const TEST_PRODUCTS = [
  { asin: 'B01KJEOCDW', expected: 'Toys/Building', price: '24.99' },
  { asin: 'B09V3KXJPB', expected: 'Electronics/Tablet', price: '449.99' },
  { asin: 'B0D1XD1ZV3', expected: 'Video Games', price: '59.99' },
  { asin: 'B0CSKY87CX', expected: 'Book', price: '14.99' },
  { asin: 'B08N5WRWNW', expected: 'Home/Kitchen', price: '29.99' },
];

async function test() {
  console.log('🧪 Testing Category Detection Across Product Types\n');
  console.log('═'.repeat(70) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  const results = [];

  for (const product of TEST_PRODUCTS) {
    console.log(`Testing: ${product.asin} (expected: ${product.expected})`);
    
    try {
      const response = await fetch(`${API_BASE}/auto-list-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({
          asin: product.asin,
          price: product.price,
          publish: false
        })
      });

      const result = await response.json();
      
      if (result.success) {
        console.log(`  ✅ ${result.title?.substring(0, 40)}...`);
        console.log(`     Category: ${result.category.name} (${result.category.id}) [${result.category.matchType}]`);
        
        results.push({
          asin: product.asin,
          expected: product.expected,
          actual: result.category.name,
          matchType: result.category.matchType,
          success: true
        });

        // Cleanup
        await fetch(`${API_BASE}/delete-ebay-offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ offerId: result.offerId })
        });
        await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ sku: result.sku })
        });
      } else {
        console.log(`  ❌ Failed: ${result.message || result.error}`);
        results.push({
          asin: product.asin,
          expected: product.expected,
          error: result.message || result.error,
          success: false
        });
      }
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
      results.push({ asin: product.asin, expected: product.expected, error: err.message, success: false });
    }
    
    console.log('');
  }

  // Summary
  console.log('═'.repeat(70));
  console.log('\n📊 SUMMARY\n');
  console.log('ASIN         | Expected        | Actual              | Match Type');
  console.log('─'.repeat(70));
  for (const r of results) {
    if (r.success) {
      console.log(`${r.asin} | ${r.expected.padEnd(15)} | ${r.actual.padEnd(19)} | ${r.matchType}`);
    } else {
      console.log(`${r.asin} | ${r.expected.padEnd(15)} | ❌ ${r.error?.substring(0, 30)}`);
    }
  }
  
  const passed = results.filter(r => r.success).length;
  console.log(`\n${passed}/${results.length} products tested successfully`);
}

test().catch(console.error);
