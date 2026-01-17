/**
 * Load Test: Catalog Import & ASIN Correlation Feature
 * Target: UAT site - https://dainty-horse-49c336.netlify.app
 * 
 * Test Scenarios:
 * 1. Single Import - Import 10 ASINs, measure time
 * 2. Bulk Import - Import 100 ASINs, measure time
 * 3. Concurrent Syncs - Queue 10 items for correlation simultaneously
 * 4. Rate Limit Check - How many concurrent requests before failures?
 * 5. Error Handling - Invalid ASINs, network timeouts
 * 6. Full Pipeline - Import → Fetch Images → Sync → View Correlations
 */

const BASE_URL = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

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
  'B0CJCKM81B', 'B0C4RMFXMB', 'B0BY2Y86V6', 'B0BY318VFQ', 'B0BY2Y3PMV'
];

// Invalid ASINs for error testing
const INVALID_ASINS = [
  'NOTANASIN1',
  'INVALID123',
  '12345',
  '',
  'AAAAAAAAAA', // Valid format but not real
];

// Results collector
const results = {
  testDate: new Date().toISOString(),
  environment: 'UAT',
  baseUrl: BASE_URL,
  scenarios: {}
};

// Metrics helpers
function calculateStats(times) {
  if (!times.length) return { avg: 0, p95: 0, max: 0, min: 0 };
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
      signal: AbortSignal.timeout(options.timeout || 60000)
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
 * Scenario 1: Test LIST action (baseline, no auth required for some)
 */
async function testListEndpoint() {
  console.log('\n📋 Scenario 1: Testing LIST endpoint (baseline)...\n');
  
  const times = [];
  const errors = [];
  
  for (let i = 0; i < 5; i++) {
    const result = await timedFetch(`${BASE_URL}/catalog-import?action=list&limit=50`);
    times.push(result.elapsed);
    if (!result.success) {
      errors.push({ attempt: i + 1, error: result.error || result.data });
    }
    console.log(`  Request ${i + 1}: ${result.elapsed}ms - ${result.success ? '✅' : '❌'}`);
    await new Promise(r => setTimeout(r, 500)); // Small delay
  }
  
  results.scenarios.list = {
    description: 'List catalog items (no auth)',
    requests: 5,
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
  
  // This typically requires auth - test response behavior
  const result = await timedFetch(`${BASE_URL}/catalog-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'fetch_images',
      asins: TEST_ASINS_KNOWN.slice(0, 5)
    }),
    timeout: 120000
  });
  
  console.log(`  Response: ${result.elapsed}ms - Status ${result.status}`);
  console.log(`  Data preview:`, JSON.stringify(result.data).slice(0, 200));
  
  results.scenarios.fetchImages = {
    description: 'Fetch images from Keepa for 5 ASINs',
    elapsed: result.elapsed,
    success: result.success,
    status: result.status,
    response: result.data
  };
}

/**
 * Scenario 3: Test SYNC action with different batch sizes
 */
async function testSyncBatches() {
  console.log('\n🔄 Scenario 3: Testing SYNC with different batch sizes...\n');
  
  const batchSizes = [1, 5, 10];
  const batchResults = [];
  
  for (const size of batchSizes) {
    console.log(`  Testing batch size: ${size}...`);
    const result = await timedFetch(`${BASE_URL}/catalog-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'sync',
        ids: Array(size).fill(0).map((_, i) => `test-${i}`)
      }),
      timeout: 180000
    });
    
    console.log(`    Result: ${result.elapsed}ms - Status ${result.status}`);
    batchResults.push({
      batchSize: size,
      elapsed: result.elapsed,
      status: result.status,
      success: result.success,
      data: result.data
    });
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  results.scenarios.syncBatches = {
    description: 'Sync with different batch sizes',
    batches: batchResults
  };
}

/**
 * Scenario 4: Concurrent request test
 */
async function testConcurrentRequests() {
  console.log('\n⚡ Scenario 4: Testing concurrent LIST requests...\n');
  
  const concurrencyLevels = [2, 5, 10, 20];
  const concurrencyResults = [];
  
  for (const concurrency of concurrencyLevels) {
    console.log(`  Testing ${concurrency} concurrent requests...`);
    
    const start = Date.now();
    const promises = Array(concurrency).fill(0).map(() =>
      timedFetch(`${BASE_URL}/catalog-import?action=list&limit=10`)
    );
    
    const responses = await Promise.all(promises);
    const totalTime = Date.now() - start;
    
    const successes = responses.filter(r => r.success).length;
    const failures = responses.filter(r => !r.success).length;
    const times = responses.map(r => r.elapsed);
    
    console.log(`    Completed: ${successes}/${concurrency} in ${totalTime}ms`);
    
    concurrencyResults.push({
      concurrency,
      totalTime,
      successes,
      failures,
      stats: calculateStats(times),
      errorTypes: responses.filter(r => !r.success).map(r => r.error || r.status)
    });
    
    await new Promise(r => setTimeout(r, 2000)); // Recover between tests
  }
  
  results.scenarios.concurrency = {
    description: 'Concurrent request handling',
    levels: concurrencyResults,
    recommendation: concurrencyResults.find(r => r.failures > 0)
      ? `Rate limit detected at ${concurrencyResults.find(r => r.failures > 0).concurrency} concurrent requests`
      : 'No rate limit detected up to 20 concurrent requests'
  };
}

/**
 * Scenario 5: Test ASIN correlation trigger
 */
async function testCorrelationTrigger() {
  console.log('\n🔗 Scenario 5: Testing ASIN correlation trigger...\n');
  
  const times = [];
  const correlationResults = [];
  
  for (const asin of TEST_ASINS_KNOWN.slice(0, 3)) {
    console.log(`  Testing correlation for ${asin}...`);
    
    const result = await timedFetch(`${BASE_URL}/trigger-asin-correlation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin }),
      timeout: 120000
    });
    
    times.push(result.elapsed);
    console.log(`    Result: ${result.elapsed}ms - Status ${result.status}`);
    
    correlationResults.push({
      asin,
      elapsed: result.elapsed,
      status: result.status,
      success: result.success,
      correlationCount: result.data?.count || 0,
      data: typeof result.data === 'object' ? result.data : null
    });
    
    await new Promise(r => setTimeout(r, 2000)); // Keepa rate limit friendly
  }
  
  results.scenarios.correlationTrigger = {
    description: 'ASIN correlation trigger (calls Keepa + possibly Claude)',
    asins: correlationResults,
    stats: calculateStats(times)
  };
}

/**
 * Scenario 6: Test v2 correlation endpoint
 */
async function testCorrelationV2() {
  console.log('\n🔗 Scenario 6: Testing v2 ASIN correlation...\n');
  
  const times = [];
  const correlationResults = [];
  
  for (const asin of TEST_ASINS_KNOWN.slice(3, 6)) {
    console.log(`  Testing v2 correlation for ${asin}...`);
    
    const result = await timedFetch(`${BASE_URL}/trigger-asin-correlation-v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin }),
      timeout: 120000
    });
    
    times.push(result.elapsed);
    console.log(`    Result: ${result.elapsed}ms - Status ${result.status}`);
    
    correlationResults.push({
      asin,
      elapsed: result.elapsed,
      status: result.status,
      success: result.success,
      data: typeof result.data === 'object' ? result.data : null
    });
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  results.scenarios.correlationV2 = {
    description: 'ASIN correlation v2 endpoint',
    asins: correlationResults,
    stats: calculateStats(times)
  };
}

/**
 * Scenario 7: Error handling test
 */
async function testErrorHandling() {
  console.log('\n❌ Scenario 7: Testing error handling...\n');
  
  const errorTests = [];
  
  // Test invalid ASINs
  console.log('  Testing invalid ASINs...');
  for (const asin of INVALID_ASINS.slice(0, 3)) {
    const result = await timedFetch(`${BASE_URL}/trigger-asin-correlation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asin }),
      timeout: 30000
    });
    
    errorTests.push({
      test: `Invalid ASIN: "${asin}"`,
      status: result.status,
      errorMessage: result.data?.error || result.data?.message || 'No error message',
      handledGracefully: result.status >= 400 && result.status < 500
    });
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Test missing required fields
  console.log('  Testing missing fields...');
  const missingFieldResult = await timedFetch(`${BASE_URL}/catalog-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    timeout: 10000
  });
  
  errorTests.push({
    test: 'Missing required fields',
    status: missingFieldResult.status,
    errorMessage: missingFieldResult.data?.error || missingFieldResult.data?.message || 'No error message',
    handledGracefully: missingFieldResult.status >= 400 && missingFieldResult.status < 500
  });
  
  // Test invalid action
  console.log('  Testing invalid action...');
  const invalidActionResult = await timedFetch(`${BASE_URL}/catalog-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

/**
 * Scenario 8: Health check endpoint
 */
async function testHealthEndpoint() {
  console.log('\n🏥 Scenario 8: Testing health endpoint...\n');
  
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

// ==================== MAIN TEST RUNNER ====================

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   LOAD TEST: Catalog Import & ASIN Correlation');
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
    await testSyncBatches();
    await testCorrelationTrigger();
    await testCorrelationV2();
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
  
  // Correlation
  if (results.scenarios.correlationTrigger) {
    console.log(`🔗 Correlation v1: avg=${results.scenarios.correlationTrigger.stats.avg}ms, p95=${results.scenarios.correlationTrigger.stats.p95}ms`);
  }
  
  if (results.scenarios.correlationV2) {
    console.log(`🔗 Correlation v2: avg=${results.scenarios.correlationV2.stats.avg}ms, p95=${results.scenarios.correlationV2.stats.p95}ms`);
  }
  
  // Error handling
  if (results.scenarios.errorHandling) {
    console.log(`❌ Error Handling: ${results.scenarios.errorHandling.allHandledGracefully ? 'All errors handled gracefully ✅' : 'Some errors not handled gracefully ⚠️'}`);
  }
  
  console.log(`\n⏱️  Total test time: ${Math.round(results.totalTestTime / 1000)}s`);
  
  // Output full results as JSON
  console.log('\n📄 Full results saved to load-test-results.json');
  
  return results;
}

// Run tests
runAllTests().then(results => {
  // Write results to file
  const fs = require('fs');
  fs.writeFileSync(
    'load-test-results.json',
    JSON.stringify(results, null, 2)
  );
  console.log('\n✅ Load test complete!');
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
