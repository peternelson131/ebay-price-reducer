/**
 * Authenticated Load Test: Catalog Import & ASIN Correlation Feature
 * Target: UAT site - https://dainty-horse-49c336.netlify.app
 */

const BASE_URL = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';
const AUTH_TOKEN = process.env.AUTH_TOKEN;

// Test ASINs - mix of categories
const TEST_ASINS_KNOWN = [
  'B01KJEOCDW', // LEGO - known good
  'B07FZ8S74R', // Echo Dot
  'B08FC6MR62', // PS5
  'B09JQMJHXY', // AirPods Pro
  'B0BDJ279KT', // Echo Show 5
  'B0BDJLS4DR', // Kindle Paperwhite
  'B0BTY3MZH3', // Fire TV Stick 4K Max
  'B0BJFWDZ74', // Echo Pop
  'B07YNM3KM5', // Fire TV Stick Lite
  'B07PFFMP9P', // Fire HD 10
];

// Generate additional test ASINs (various products)
const ADDITIONAL_ASINS = [
  'B08N5WRWNW', 'B09V3KXJPB', 'B0CHWRXH8X', 'B0B8H2F41X', 'B0BS2JVVNC',
  'B0CQRWJF81', 'B0CQRWKKQJ', 'B0BY33V6S1', 'B0CNWVKGTX', 'B0D8SLKSG2',
  'B0D1XD1ZV3', 'B0CHX3PXKF', 'B0CP3Y22Y6', 'B0CPYNQDGT', 'B0CPYN5VNY',
  'B0CQRRRPMS', 'B09SWCWV2Q', 'B09V49Y8FL', 'B0BSHF7WHW', 'B0CL5KNB9M',
];

// Results collector
const results = {
  testDate: new Date().toISOString(),
  environment: 'UAT',
  baseUrl: BASE_URL,
  authStatus: 'authenticated',
  scenarios: {}
};

// Metrics helpers
function calculateStats(times) {
  if (!times.length) return { avg: 0, p95: 0, max: 0, min: 0, count: 0 };
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: Math.round(sum / sorted.length),
    p95: sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1],
    max: sorted[sorted.length - 1],
    min: sorted[0],
    count: sorted.length
  };
}

async function timedFetch(url, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      signal: AbortSignal.timeout(options.timeout || 120000)
    });
    const elapsed = Date.now() - start;
    let data;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    return {
      success: response.ok,
      status: response.status,
      elapsed,
      data,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      status: 0,
      elapsed: Date.now() - start,
      data: null,
      error: error.message
    };
  }
}

// ==================== TEST SCENARIOS ====================

/**
 * Scenario 1: Test LIST action - get catalog items
 */
async function testListEndpoint() {
  console.log('\n📋 Scenario 1: Testing LIST endpoint (authenticated)...\n');
  
  const times = [];
  const errors = [];
  const pageSizes = [10, 50, 100];
  
  for (const limit of pageSizes) {
    console.log(`  Testing with limit=${limit}...`);
    for (let i = 0; i < 3; i++) {
      const result = await timedFetch(`${BASE_URL}/catalog-import?action=list&limit=${limit}`);
      times.push(result.elapsed);
      if (!result.success) {
        errors.push({ limit, attempt: i + 1, error: result.error || result.data });
      }
      console.log(`    Request ${i + 1}: ${result.elapsed}ms - ${result.success ? '✅' : '❌'} (${result.data?.items?.length || 0} items)`);
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  results.scenarios.list = {
    description: 'List catalog items with different page sizes',
    requests: times.length,
    stats: calculateStats(times),
    errors: errors.length,
    errorDetails: errors
  };
}

/**
 * Scenario 2: Test fetch_images action
 */
async function testFetchImages() {
  console.log('\n🖼️  Scenario 2: Testing FETCH_IMAGES action...\n');
  
  const batchSizes = [5, 10];
  const fetchResults = [];
  
  for (const size of batchSizes) {
    console.log(`  Testing fetch_images with ${size} ASINs...`);
    const asins = TEST_ASINS_KNOWN.slice(0, size);
    
    const result = await timedFetch(`${BASE_URL}/catalog-import`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'fetch_images',
        asins
      }),
      timeout: 180000
    });
    
    console.log(`    Response: ${result.elapsed}ms - Status ${result.status}`);
    if (result.data) {
      console.log(`    Result: ${JSON.stringify(result.data).slice(0, 200)}...`);
    }
    
    fetchResults.push({
      batchSize: size,
      elapsed: result.elapsed,
      status: result.status,
      success: result.success,
      tokensUsed: result.data?.keepaTokensUsed || 0,
      imagesUpdated: result.data?.updatedCount || 0
    });
    
    await new Promise(r => setTimeout(r, 2000)); // Keepa rate limit
  }
  
  results.scenarios.fetchImages = {
    description: 'Fetch images from Keepa for ASINs',
    batches: fetchResults,
    stats: calculateStats(fetchResults.map(r => r.elapsed))
  };
}

/**
 * Scenario 3: Test SYNC action - trigger correlation
 */
async function testSyncAction() {
  console.log('\n🔄 Scenario 3: Testing SYNC action (correlation trigger)...\n');
  
  // First, get list of items to sync
  const listResult = await timedFetch(`${BASE_URL}/catalog-import?action=list&limit=20`);
  
  if (!listResult.success || !listResult.data?.items?.length) {
    console.log('  ⚠️ No items to sync - need to import first');
    results.scenarios.sync = {
      description: 'Sync (correlation) action',
      skipped: true,
      reason: 'No items available to sync'
    };
    return;
  }
  
  const items = listResult.data.items;
  console.log(`  Found ${items.length} items available`);
  
  // Test single sync
  if (items.length > 0) {
    console.log(`  Testing single item sync (${items[0].asin})...`);
    const singleStart = Date.now();
    const singleResult = await timedFetch(`${BASE_URL}/catalog-import`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'sync',
        ids: [items[0].id]
      }),
      timeout: 180000
    });
    const singleElapsed = Date.now() - singleStart;
    console.log(`    Single sync: ${singleElapsed}ms - ${singleResult.success ? '✅' : '❌'}`);
    
    results.scenarios.singleSync = {
      description: 'Single item correlation sync',
      elapsed: singleElapsed,
      success: singleResult.success,
      status: singleResult.status,
      data: singleResult.data
    };
    
    await new Promise(r => setTimeout(r, 3000)); // Wait for rate limits
  }
  
  // Test batch sync (5 items)
  if (items.length >= 5) {
    console.log(`  Testing batch sync (5 items)...`);
    const batchStart = Date.now();
    const batchResult = await timedFetch(`${BASE_URL}/catalog-import`, {
      method: 'POST',
      body: JSON.stringify({
        action: 'sync',
        ids: items.slice(0, 5).map(i => i.id)
      }),
      timeout: 300000
    });
    const batchElapsed = Date.now() - batchStart;
    console.log(`    Batch sync (5): ${batchElapsed}ms - ${batchResult.success ? '✅' : '❌'}`);
    
    results.scenarios.batchSync = {
      description: 'Batch correlation sync (5 items)',
      elapsed: batchElapsed,
      success: batchResult.success,
      status: batchResult.status,
      data: batchResult.data
    };
  }
}

/**
 * Scenario 4: Concurrent request test
 */
async function testConcurrentRequests() {
  console.log('\n⚡ Scenario 4: Testing concurrent LIST requests...\n');
  
  const concurrencyLevels = [2, 5, 10, 15];
  const concurrencyResults = [];
  
  for (const concurrency of concurrencyLevels) {
    console.log(`  Testing ${concurrency} concurrent requests...`);
    
    const start = Date.now();
    const promises = Array(concurrency).fill(0).map(() =>
      timedFetch(`${BASE_URL}/catalog-import?action=list&limit=20`)
    );
    
    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;
    
    const successes = responses.filter(r => r.success).length;
    const failures = responses.filter(r => !r.success).length;
    const times = responses.map(r => r.elapsed);
    
    console.log(`    Completed: ${successes}/${concurrency} in ${totalTime}ms`);
    if (failures > 0) {
      console.log(`    Errors: ${responses.filter(r => !r.success).map(r => r.status || r.error).join(', ')}`);
    }
    
    concurrencyResults.push({
      concurrency,
      totalTime,
      successes,
      failures,
      stats: calculateStats(times),
      errors: responses.filter(r => !r.success).map(r => r.error || `HTTP ${r.status}`)
    });
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  results.scenarios.concurrency = {
    description: 'Concurrent request handling',
    levels: concurrencyResults,
    recommendation: concurrencyResults.find(r => r.failures > 0)
      ? `Rate limit detected at ${concurrencyResults.find(r => r.failures > 0).concurrency} concurrent requests`
      : `No rate limit detected up to ${concurrencyLevels[concurrencyLevels.length - 1]} concurrent requests`
  };
}

/**
 * Scenario 5: Test ASIN correlation trigger endpoint
 */
async function testCorrelationTrigger() {
  console.log('\n🔗 Scenario 5: Testing ASIN correlation trigger...\n');
  
  const times = [];
  const correlationResults = [];
  
  for (const asin of TEST_ASINS_KNOWN.slice(0, 3)) {
    console.log(`  Testing correlation for ${asin}...`);
    
    const result = await timedFetch(`${BASE_URL}/trigger-asin-correlation-v2`, {
      method: 'POST',
      body: JSON.stringify({ asin }),
      timeout: 180000
    });
    
    times.push(result.elapsed);
    console.log(`    Result: ${result.elapsed}ms - Status ${result.status}`);
    if (result.data) {
      console.log(`    Data: count=${result.data?.count || 0}, stats=${JSON.stringify(result.data?.stats || {})}`);
    }
    
    correlationResults.push({
      asin,
      elapsed: result.elapsed,
      status: result.status,
      success: result.success,
      correlationCount: result.data?.count || 0,
      stats: result.data?.stats || {}
    });
    
    await new Promise(r => setTimeout(r, 3000)); // Keepa rate limit
  }
  
  results.scenarios.correlationTrigger = {
    description: 'ASIN correlation trigger (Keepa + AI)',
    asins: correlationResults,
    stats: calculateStats(times)
  };
}

/**
 * Scenario 6: Test health endpoint
 */
async function testHealthEndpoint() {
  console.log('\n🏥 Scenario 6: Testing health endpoint...\n');
  
  const times = [];
  
  for (let i = 0; i < 5; i++) {
    const result = await timedFetch(`${BASE_URL}/health`);
    times.push(result.elapsed);
    console.log(`  Request ${i + 1}: ${result.elapsed}ms - ${result.success ? '✅' : '❌'}`);
  }
  
  results.scenarios.health = {
    description: 'Health endpoint baseline',
    stats: calculateStats(times)
  };
}

/**
 * Scenario 7: Error handling test
 */
async function testErrorHandling() {
  console.log('\n❌ Scenario 7: Testing error handling...\n');
  
  const errorTests = [];
  
  // Test invalid ASIN
  console.log('  Testing invalid ASIN...');
  const invalidAsinResult = await timedFetch(`${BASE_URL}/trigger-asin-correlation-v2`, {
    method: 'POST',
    body: JSON.stringify({ asin: 'NOTVALID123' }),
    timeout: 30000
  });
  
  errorTests.push({
    test: 'Invalid ASIN',
    status: invalidAsinResult.status,
    errorMessage: invalidAsinResult.data?.error || invalidAsinResult.data?.message || 'No error message',
    handledGracefully: invalidAsinResult.status >= 400 && invalidAsinResult.status < 500
  });
  
  // Test missing action
  console.log('  Testing missing action...');
  const missingActionResult = await timedFetch(`${BASE_URL}/catalog-import`, {
    method: 'POST',
    body: JSON.stringify({ data: 'no action' }),
    timeout: 10000
  });
  
  errorTests.push({
    test: 'Missing action',
    status: missingActionResult.status,
    errorMessage: missingActionResult.data?.error || missingActionResult.data?.message || 'No error message',
    handledGracefully: missingActionResult.status >= 400 && missingActionResult.status < 500
  });
  
  // Test invalid action
  console.log('  Testing invalid action...');
  const invalidActionResult = await timedFetch(`${BASE_URL}/catalog-import`, {
    method: 'POST',
    body: JSON.stringify({ action: 'invalid_action_xyz' }),
    timeout: 10000
  });
  
  errorTests.push({
    test: 'Invalid action',
    status: invalidActionResult.status,
    errorMessage: invalidActionResult.data?.error || invalidActionResult.data?.message || 'No error message',
    handledGracefully: invalidActionResult.status >= 400 && invalidActionResult.status < 500
  });
  
  results.scenarios.errorHandling = {
    description: 'Error handling for invalid inputs',
    tests: errorTests,
    allHandledGracefully: errorTests.every(t => t.handledGracefully)
  };
}

// ==================== MAIN TEST RUNNER ====================

async function runAllTests() {
  if (!AUTH_TOKEN) {
    console.error('❌ AUTH_TOKEN environment variable required');
    process.exit(1);
  }
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   AUTHENTICATED LOAD TEST: Catalog Import & ASIN Correlation');
  console.log(`   Target: ${BASE_URL}`);
  console.log(`   Date: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  const startTime = Date.now();
  
  try {
    // Run test scenarios
    await testHealthEndpoint();
    await testListEndpoint();
    await testConcurrentRequests();
    await testFetchImages();
    await testSyncAction();
    await testCorrelationTrigger();
    await testErrorHandling();
    
  } catch (error) {
    console.error('\n💥 Test suite error:', error);
    results.error = error.message;
  }
  
  results.totalTestTime = Date.now() - startTime;
  
  // Generate summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   LOAD TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Health check
  if (results.scenarios.health) {
    console.log(`📍 Health Endpoint: avg=${results.scenarios.health.stats.avg}ms, p95=${results.scenarios.health.stats.p95}ms`);
  }
  
  // List endpoint
  if (results.scenarios.list) {
    console.log(`📋 List Endpoint: avg=${results.scenarios.list.stats.avg}ms, p95=${results.scenarios.list.stats.p95}ms, errors=${results.scenarios.list.errors}`);
  }
  
  // Concurrency
  if (results.scenarios.concurrency) {
    console.log(`⚡ Concurrency Test: ${results.scenarios.concurrency.recommendation}`);
  }
  
  // Fetch images
  if (results.scenarios.fetchImages) {
    console.log(`🖼️  Fetch Images: avg=${results.scenarios.fetchImages.stats.avg}ms`);
  }
  
  // Correlation
  if (results.scenarios.correlationTrigger) {
    console.log(`🔗 Correlation Trigger: avg=${results.scenarios.correlationTrigger.stats.avg}ms, p95=${results.scenarios.correlationTrigger.stats.p95}ms`);
  }
  
  // Error handling
  if (results.scenarios.errorHandling) {
    console.log(`❌ Error Handling: ${results.scenarios.errorHandling.allHandledGracefully ? 'All errors handled gracefully ✅' : 'Some errors not handled gracefully ⚠️'}`);
  }
  
  console.log(`\n⏱️  Total test time: ${Math.round(results.totalTestTime / 1000)}s`);
  
  return results;
}

// Run tests
runAllTests().then(results => {
  // Write results to file
  const fs = require('fs');
  fs.writeFileSync(
    'load-test-authenticated-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n📄 Full results saved to load-test-authenticated-results.json');
  console.log('\n✅ Authenticated load test complete!');
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
