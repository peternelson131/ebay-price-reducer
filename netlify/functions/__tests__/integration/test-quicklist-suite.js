/**
 * Quick List Test Suite
 * 
 * Tests the auto-list-single endpoint systematically to verify 99% success rate.
 * Uses publish: false to avoid creating real eBay listings.
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Y2RrYW5jY2JkZXFlYm5hYmdnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTAwNDA3MCwiZXhwIjoyMDc0NTgwMDcwfQ.r44KVS4730gbXbpkaW10wm4xJTX9imGi8sxOC64u2PU';
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Test ASINs across different categories
const TEST_ASINS = [
  { asin: 'B08N5WRWNW', name: 'Fire Tablet (Electronics)', price: '49.99' },
  { asin: 'B01KJEOCDW', name: 'LEGO Dinosaur (Toys)', price: '24.99' },
  { asin: 'B07FZ8S74R', name: 'Echo Dot (Electronics)', price: '29.99' },
  { asin: 'B08J65DST5', name: 'PS5 Controller (Video Games)', price: '59.99' },
  { asin: 'B0931VRJT7', name: 'Kitchen Item', price: '19.99' },
  { asin: 'B09JQL3NWT', name: 'Random Product', price: '14.99' },
  { asin: 'B07XJ8C8F5', name: 'Another Product', price: '34.99' },
  { asin: 'B08N5LM1K3', name: 'Tablet Variant', price: '39.99' },
];

// Edge cases
const EDGE_CASES = [
  { asin: 'BINVALID99', name: 'Invalid ASIN format', price: '10.00', expectedError: true },
  { asin: 'B0000000XX', name: 'Non-existent ASIN', price: '10.00', expectedError: true },
  { asin: 'B08N5WRWNW', name: 'Invalid price (zero)', price: '0', expectedError: true },
  { asin: 'B08N5WRWNW', name: 'Invalid price (negative)', price: '-5', expectedError: true },
];

let results = [];
let authToken = null;

async function getAuthToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Use Pete's test credentials
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'peternelson131@outlook.com',
    password: 'sPx6T3JbVGFjco'
  });

  if (error) {
    console.error('Auth error:', error);
    throw error;
  }

  return data.session.access_token;
}

async function testAutoList(testCase) {
  const { asin, name, price, expectedError } = testCase;
  const startTime = Date.now();
  
  console.log(`\n🧪 Testing: ${name}`);
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
        publish: false  // Don't create real listings!
      })
    });

    const data = await response.json();
    const elapsed = Date.now() - startTime;

    const result = {
      name,
      asin,
      price,
      status: response.status,
      success: response.ok && data.success,
      elapsed,
      expectedError: !!expectedError,
      data: response.ok ? { sku: data.sku, title: data.title?.substring(0, 50) } : data
    };

    // Check if result matches expectation
    if (expectedError) {
      result.pass = !response.ok || !data.success;
      console.log(`   ${result.pass ? '✅' : '❌'} Expected error: ${result.pass ? 'Got error as expected' : 'Should have failed!'}`);
    } else {
      result.pass = response.ok && data.success;
      console.log(`   ${result.pass ? '✅' : '❌'} ${result.pass ? `Success (${elapsed}ms)` : `Failed: ${data.error || data.message}`}`);
    }

    if (data.sku) console.log(`   SKU: ${data.sku}`);
    if (data.title) console.log(`   Title: ${data.title.substring(0, 60)}...`);

    results.push(result);
    return result;

  } catch (error) {
    const elapsed = Date.now() - startTime;
    const result = {
      name,
      asin,
      price,
      status: 0,
      success: false,
      pass: !!expectedError,  // Network error passes if we expected error
      elapsed,
      expectedError: !!expectedError,
      error: error.message
    };
    console.log(`   ❌ Network error: ${error.message}`);
    results.push(result);
    return result;
  }
}

async function cleanupTestItems() {
  console.log('\n🧹 Cleaning up test inventory items...');
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Get all SKUs that were created
  const skus = results
    .filter(r => r.success && r.data?.sku)
    .map(r => r.data.sku);

  for (const sku of skus) {
    try {
      // Delete offer first (if exists)
      await fetch(`${API_BASE}/delete-ebay-offer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ sku })
      });

      // Then delete inventory item
      await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ sku })
      });

      console.log(`   Cleaned up: ${sku}`);
    } catch (e) {
      console.log(`   Failed to cleanup ${sku}: ${e.message}`);
    }
  }
}

async function run() {
  console.log('═'.repeat(60));
  console.log('     QUICK LIST TEST SUITE');
  console.log('═'.repeat(60));
  console.log(`\n📅 ${new Date().toISOString()}`);
  console.log(`🎯 Target: 99% success rate\n`);

  try {
    // Get auth token
    console.log('🔐 Authenticating...');
    authToken = await getAuthToken();
    console.log('✅ Authenticated\n');

    // Run main test cases
    console.log('─'.repeat(60));
    console.log('PHASE 1: Valid ASIN Tests (should all succeed)');
    console.log('─'.repeat(60));

    for (const testCase of TEST_ASINS) {
      await testAutoList(testCase);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    // Run edge cases
    console.log('\n' + '─'.repeat(60));
    console.log('PHASE 2: Edge Cases (should fail gracefully)');
    console.log('─'.repeat(60));

    for (const testCase of EDGE_CASES) {
      await testAutoList(testCase);
      await new Promise(r => setTimeout(r, 500));
    }

    // Calculate results
    const totalTests = results.length;
    const passed = results.filter(r => r.pass).length;
    const failed = results.filter(r => !r.pass).length;
    const successRate = ((passed / totalTests) * 100).toFixed(1);

    // Separate valid vs error cases
    const validTests = results.filter(r => !r.expectedError);
    const validPassed = validTests.filter(r => r.pass).length;
    const validSuccessRate = ((validPassed / validTests.length) * 100).toFixed(1);

    console.log('\n' + '═'.repeat(60));
    console.log('     TEST RESULTS');
    console.log('═'.repeat(60));
    console.log(`\n📊 Overall Results:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   Passed: ${passed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Success Rate: ${successRate}%`);
    
    console.log(`\n📊 Valid ASIN Tests (Core Flow):`);
    console.log(`   Total: ${validTests.length}`);
    console.log(`   Passed: ${validPassed}`);
    console.log(`   Success Rate: ${validSuccessRate}%`);
    console.log(`   ${validSuccessRate >= 99 ? '✅ MEETS 99% TARGET' : '❌ BELOW 99% TARGET'}`);

    // Show failures
    const failures = results.filter(r => !r.pass);
    if (failures.length > 0) {
      console.log('\n❌ FAILURES:');
      failures.forEach(f => {
        console.log(`   - ${f.name}: ${f.error || f.data?.error || f.data?.message || 'Unknown error'}`);
      });
    }

    // Avg response time for successful tests
    const successfulTimes = results.filter(r => r.success).map(r => r.elapsed);
    if (successfulTimes.length > 0) {
      const avgTime = (successfulTimes.reduce((a, b) => a + b, 0) / successfulTimes.length).toFixed(0);
      console.log(`\n⏱️ Average Response Time: ${avgTime}ms`);
    }

    // Cleanup
    await cleanupTestItems();

    console.log('\n' + '═'.repeat(60));
    console.log('     TEST COMPLETE');
    console.log('═'.repeat(60));

    // Return summary for reporting
    return {
      totalTests,
      passed,
      failed,
      successRate: parseFloat(successRate),
      validSuccessRate: parseFloat(validSuccessRate),
      meetsTarget: parseFloat(validSuccessRate) >= 99,
      failures: failures.map(f => ({ name: f.name, error: f.error || f.data?.error || f.data?.message }))
    };

  } catch (error) {
    console.error('\n💥 Test suite error:', error.message);
    throw error;
  }
}

run()
  .then(summary => {
    console.log('\n📋 Summary JSON:', JSON.stringify(summary, null, 2));
    process.exit(summary.meetsTarget ? 0 : 1);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
