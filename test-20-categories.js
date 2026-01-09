const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Pete's 20 diverse ASINs
const TEST_PRODUCTS = [
  { asin: 'B0BSHF7WHW', category: 'Electronics', price: '49.99' },
  { asin: '0735219095', category: 'Books', price: '16.99' },
  { asin: 'B00FLYWNYQ', category: 'Home & Kitchen', price: '89.99' },
  { asin: 'B08CRSM9FR', category: 'Toys & Games', price: '29.99' },
  { asin: 'B07PDHSJ3N', category: 'Sports & Outdoors', price: '14.99' },
  { asin: 'B07BKLMWRP', category: 'Clothing', price: '24.99' },
  { asin: 'B00U2UYWA0', category: 'Beauty', price: '14.99' },
  { asin: 'B0002AQCXM', category: 'Pet Supplies', price: '29.99' },
  { asin: 'B00004UDUS', category: 'Tools', price: '79.99' },
  { asin: 'B082PRL21R', category: 'Garden', price: '34.99' },
  { asin: 'B07MV3DWMK', category: 'Office Products', price: '19.99' },
  { asin: 'B078YCRQB8', category: 'Grocery', price: '29.99' },
  { asin: 'B00A1FXQRK', category: 'Health', price: '19.99' },
  { asin: 'B01M4NQDM5', category: 'Baby', price: '49.99' },
  { asin: 'B071JK9BKZ', category: 'Automotive', price: '24.99' },
  { asin: 'B0CQYHY3QV', category: 'Video Games', price: '59.99' },
  { asin: 'B0D5F2C746', category: 'Music', price: '29.99' },
  { asin: 'B09QJWCBV8', category: 'Movies', price: '24.99' },
  { asin: 'B0BSHGHGXR', category: 'Computers', price: '999.99' },
  { asin: 'B09JZT6YK5', category: 'Camera', price: '349.99' },
];

async function test() {
  console.log('🧪 TESTING 20 DIVERSE CATEGORIES\n');
  console.log('═'.repeat(90) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  const successes = [];
  const failures = [];

  for (const product of TEST_PRODUCTS) {
    process.stdout.write(`${(product.category).padEnd(18)} ${product.asin}... `);
    
    try {
      const response = await fetch(`${API_BASE}/auto-list-single`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ asin: product.asin, price: product.price, publish: true })
      });

      const result = await response.json();
      
      if (result.success && result.listingId) {
        console.log(`✅ Listed! ${result.category?.name} (${result.listingId})`);
        successes.push({
          asin: product.asin,
          expectedCategory: product.category,
          ebayCategory: result.category?.name,
          ebayCategoryId: result.category?.id,
          matchType: result.category?.matchType,
          listingId: result.listingId,
          url: result.listingUrl
        });
      } else {
        const errorShort = (result.message || result.error || 'Unknown error').replace('eBay API error: ', '');
        console.log(`❌ ${errorShort.substring(0, 55)}`);
        failures.push({
          asin: product.asin,
          expectedCategory: product.category,
          ebayCategory: result.category?.name,
          ebayCategoryId: result.category?.id,
          error: result.message || result.error
        });
      }
    } catch (err) {
      console.log(`❌ ${err.message.substring(0, 55)}`);
      failures.push({ asin: product.asin, expectedCategory: product.category, error: err.message });
    }
    
    await new Promise(r => setTimeout(r, 1500));
  }

  // Save detailed results
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: TEST_PRODUCTS.length, success: successes.length, failed: failures.length },
    successes,
    failures
  };
  fs.writeFileSync('20-category-test-results.json', JSON.stringify(report, null, 2));

  // Summary
  console.log('\n' + '═'.repeat(90));
  console.log(`\n📊 RESULTS: ${successes.length}/${TEST_PRODUCTS.length} succeeded, ${failures.length} failed\n`);
  
  if (successes.length > 0) {
    console.log('✅ SUCCESS (need manual deletion):');
    successes.forEach(s => console.log(`   ${s.listingId}: ${s.expectedCategory} → ${s.ebayCategory} [${s.matchType}]`));
  }
  
  if (failures.length > 0) {
    console.log('\n❌ FAILURES BY ERROR TYPE:\n');
    
    // Group by error type
    const byError = {};
    failures.forEach(f => {
      const errorType = f.error?.includes('leaf category') ? 'Not leaf category' :
                        f.error?.includes('imageUrls') ? 'No images' :
                        f.error?.includes('not found') ? 'Product not found' :
                        f.error?.includes('BrandMPN') ? 'Missing Brand/MPN' :
                        f.error?.substring(0, 40) || 'Unknown';
      if (!byError[errorType]) byError[errorType] = [];
      byError[errorType].push(f);
    });
    
    for (const [errorType, items] of Object.entries(byError)) {
      console.log(`   📛 ${errorType} (${items.length}):`);
      items.forEach(f => console.log(`      - ${f.expectedCategory} (${f.asin}) → ${f.ebayCategory || 'N/A'}`));
    }
  }
  
  console.log('\n📁 Full results saved to: 20-category-test-results.json');
}

test().catch(console.error);
