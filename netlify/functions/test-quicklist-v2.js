/**
 * Quick List Test Suite v2
 * Tests with ASINs that have verified Keepa data
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Y2RrYW5jY2JkZXFlYm5hYmdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTAwNDA3MCwiZXhwIjoyMDc0NTgwMDcwfQ.r44KVS4730gbXbpkaW10wm4xJTX9imGi8sxOC64u2PU';
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// ASINs verified to have images in Keepa
const TEST_ASINS = [
  { asin: 'B01KJEOCDW', name: 'LEGO Dinosaur', price: '24.99' },
  { asin: 'B07FZ8S74R', name: 'Echo Dot 3rd Gen', price: '29.99' },
  { asin: 'B08FC6MR62', name: 'PS5 Digital Edition', price: '449.99' },
  { asin: 'B09JQMJHXY', name: 'AirPods Pro', price: '179.99' },
];

let results = [];
let authToken = null;
let cleanupSKUs = [];

async function getAuthToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const { data: userData } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'petenelson13@gmail.com')
    .single();

  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.email,
  });
  
  const { data: verifyData } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties?.hashed_token,
  });

  return verifyData.session.access_token;
}

async function testAutoList(testCase, testNum) {
  const { asin, name, price } = testCase;
  const startTime = Date.now();
  
  console.log(`\n[${testNum}/${TEST_ASINS.length}] Testing: ${name}`);
  console.log(`   ASIN: ${asin}, Price: $${price}`);

  try {
    const response = await fetch(`${API_BASE}/auto-list-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        asin,
        price: parseFloat(price),
        quantity: 1,
        condition: 'NEW',
        publish: false
      })
    });

    const data = await response.json();
    const elapsed = Date.now() - startTime;

    const success = response.ok && data.success;
    
    if (success) {
      cleanupSKUs.push({ sku: data.sku, offerId: data.offerId });
      console.log(`   ✅ SUCCESS (${(elapsed/1000).toFixed(1)}s)`);
      console.log(`   SKU: ${data.sku}`);
      console.log(`   Title: ${data.title}`);
      console.log(`   Category: ${data.categoryName}`);
    } else {
      console.log(`   ❌ FAILED: ${data.message || data.error}`);
    }

    results.push({
      name,
      asin,
      success,
      elapsed,
      error: success ? null : (data.message || data.error),
      sku: data.sku,
      title: data.title
    });

    return success;

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`   ❌ ERROR: ${error.message}`);
    results.push({ name, asin, success: false, elapsed, error: error.message });
    return false;
  }
}

async function cleanup() {
  console.log(`\n🧹 Cleaning up ${cleanupSKUs.length} test items...`);
  
  for (const item of cleanupSKUs) {
    try {
      if (item.offerId) {
        await fetch(`${API_BASE}/delete-ebay-offer`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: item.offerId })
        });
      }
      if (item.sku) {
        await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ sku: item.sku })
        });
      }
      console.log(`   ✓ Cleaned: ${item.sku}`);
    } catch (e) {
      console.log(`   ✗ Failed to clean ${item.sku}: ${e.message}`);
    }
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('     QUICK LIST TEST SUITE v2');
  console.log('═'.repeat(60));
  console.log(`\n📅 ${new Date().toISOString()}`);
  console.log(`🎯 Target: 99% success rate`);
  console.log(`📦 Testing ${TEST_ASINS.length} products with verified Keepa data\n`);

  try {
    console.log('🔐 Authenticating...');
    authToken = await getAuthToken();
    console.log('✅ Authenticated');

    console.log('\n' + '─'.repeat(60));
    console.log('RUNNING TESTS');
    console.log('─'.repeat(60));

    let testNum = 0;
    for (const testCase of TEST_ASINS) {
      testNum++;
      await testAutoList(testCase, testNum);
      // Delay between tests to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));
    }

    // Calculate results
    const totalTests = results.length;
    const passed = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const successRate = ((passed / totalTests) * 100).toFixed(1);

    const avgTime = results.filter(r => r.success).length > 0
      ? (results.filter(r => r.success).reduce((sum, r) => sum + r.elapsed, 0) / passed / 1000).toFixed(1)
      : 0;

    console.log('\n' + '═'.repeat(60));
    console.log('     TEST RESULTS');
    console.log('═'.repeat(60));
    
    console.log(`\n📊 Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   ✅ Passed: ${passed}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   Success Rate: ${successRate}%`);
    console.log(`   Avg Time: ${avgTime}s`);
    
    const meetsTarget = parseFloat(successRate) >= 99;
    console.log(`\n   ${meetsTarget ? '✅ MEETS 99% TARGET' : '❌ BELOW 99% TARGET'}`);

    if (failed > 0) {
      console.log('\n❌ Failures:');
      results.filter(r => !r.success).forEach(r => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
    }

    // Cleanup
    await cleanup();

    console.log('\n' + '═'.repeat(60));
    console.log('     COMPLETE');
    console.log('═'.repeat(60));

    return { totalTests, passed, failed, successRate: parseFloat(successRate), meetsTarget };

  } catch (error) {
    console.error('\n💥 Test suite error:', error.message);
    throw error;
  }
}

run()
  .then(summary => {
    console.log('\n📋 JSON:', JSON.stringify(summary));
    process.exit(summary.meetsTarget ? 0 : 1);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
