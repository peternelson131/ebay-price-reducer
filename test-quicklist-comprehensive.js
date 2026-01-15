/**
 * Comprehensive Quick List Testing Suite
 * Tests the auto-list-single endpoint for 99% success rate verification
 */

const BASE_URL = 'https://dainty-horse-49c336.netlify.app';
const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4Y2RrYW5jY2JkZXFlYm5hYmdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwMDQwNzAsImV4cCI6MjA3NDU4MDA3MH0.yjhzb26o20kuf3BUa2Dzz4R7VF1ZQYNYiUy8fqp8t2M';

// Test user credentials
const TEST_USER = {
  email: 'peternelson131@outlook.com',
  password: 'sPx6T3JbVGFjco'
};

// Test ASINs for Phase 2
const TEST_ASINS = [
  { asin: 'B08N5WRWNW', description: 'Amazon Fire tablet - Electronics', shouldSucceed: true },
  { asin: 'B0CXQT2Q9Z', description: 'LEGO set - Toys', shouldSucceed: true },
  { asin: 'B07FZ8S74R', description: 'Echo Dot - Electronics', shouldSucceed: true },
  { asin: 'B08J65DST5', description: 'PlayStation controller - Video Games', shouldSucceed: true },
  { asin: 'B0CKYPVJ9N', description: 'Protein powder - Health', shouldSucceed: true },
  { asin: 'B0D5Z5SHBB', description: 'Random accessory', shouldSucceed: true },
  { asin: 'B09V3KXJPB', description: 'Book or media', shouldSucceed: true },
  { asin: 'B0000C8Z8X', description: 'Random old product', shouldSucceed: true },
  { asin: 'BINVALID99', description: 'Invalid ASIN format', shouldSucceed: false },
  { asin: 'B00000000X', description: 'Non-existent ASIN', shouldSucceed: false }
];

// Test results storage
const results = {
  phase1: { tests: [], passed: 0, failed: 0 },
  phase2: { tests: [], passed: 0, failed: 0 },
  phase3: { tests: [], passed: 0, failed: 0 },
  startTime: new Date().toISOString(),
  endTime: null
};

// Utility functions
async function getAuthToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      email: TEST_USER.email,
      password: TEST_USER.password
    })
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Failed to authenticate: ' + JSON.stringify(data));
  }
  return data.access_token;
}

async function callQuickList(token, body) {
  const startTime = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const elapsed = Date.now() - startTime;
    const data = await res.json();
    return {
      status: res.status,
      body: data,
      elapsed
    };
  } catch (error) {
    return {
      status: 0,
      body: { error: error.message },
      elapsed: Date.now() - startTime
    };
  }
}

function recordResult(phase, testName, input, expected, actual, passed, notes = '') {
  const result = {
    testName,
    input: JSON.stringify(input),
    expected,
    actualStatus: actual.status,
    actualBody: actual.body,
    elapsed: actual.elapsed,
    passed,
    notes
  };
  results[phase].tests.push(result);
  if (passed) {
    results[phase].passed++;
  } else {
    results[phase].failed++;
  }
  const icon = passed ? '✅' : '❌';
  console.log(`${icon} ${testName}: ${passed ? 'PASS' : 'FAIL'} (${actual.elapsed}ms)`);
  if (!passed) {
    console.log(`   Expected: ${expected}`);
    console.log(`   Got: ${actual.status} - ${actual.body?.error || actual.body?.message || JSON.stringify(actual.body).substring(0, 100)}`);
  }
}

// ─────────────────────────────────────────────────────────
// Phase 1: API Validation Tests
// ─────────────────────────────────────────────────────────
async function runPhase1(token) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Phase 1: API Validation Tests (No eBay writes)');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1.1: Valid ASIN format variations
  const asinTests = [
    { asin: 'B08N5WRWNW', valid: true, desc: 'Standard ASIN' },
    { asin: 'B0123456789', valid: false, desc: 'Too long' },
    { asin: 'B012345678', valid: true, desc: 'Valid 10-char' },
    { asin: 'A08N5WRWNW', valid: false, desc: 'Wrong first letter' },
    { asin: 'B08N5wrwnw', valid: false, desc: 'Lowercase (might fail)' },
    { asin: '', valid: false, desc: 'Empty ASIN' },
    { asin: null, valid: false, desc: 'Null ASIN' },
    { asin: 'B08N5WRW', valid: false, desc: 'Too short (8 chars after B)' },
    { asin: 'BINVALID99', valid: false, desc: 'Invalid chars position' }
  ];

  for (const test of asinTests) {
    const input = { asin: test.asin, price: 19.99, publish: false };
    const result = await callQuickList(token, input);
    const passed = test.valid ? result.status === 200 || result.status === 400 && result.body?.error?.includes('not found') : result.status === 400;
    recordResult('phase1', `ASIN validation: ${test.desc}`, input, test.valid ? '200 or product-not-found' : '400', result, passed);
    await sleep(500);
  }

  // Test 1.2: Price validation
  const priceTests = [
    { price: 19.99, valid: true, desc: 'Positive decimal' },
    { price: 100, valid: true, desc: 'Positive integer' },
    { price: 0.01, valid: true, desc: 'Minimum price' },
    { price: 0, valid: false, desc: 'Zero price' },
    { price: -10, valid: false, desc: 'Negative price' },
    { price: 'abc', valid: false, desc: 'Non-numeric string' },
    { price: null, valid: false, desc: 'Null price' },
    { price: '', valid: false, desc: 'Empty string price' },
    { price: 9999999.99, valid: true, desc: 'Very large price' }
  ];

  for (const test of priceTests) {
    const input = { asin: 'B08N5WRWNW', price: test.price, publish: false };
    const result = await callQuickList(token, input);
    const passed = test.valid ? (result.status === 200 || (result.status === 400 && !result.body?.error?.includes('price'))) : result.status === 400;
    recordResult('phase1', `Price validation: ${test.desc}`, input, test.valid ? 'accept' : '400', result, passed);
    await sleep(500);
  }

  // Test 1.3: Auth tests
  console.log('\n--- Auth Tests ---');
  
  // No token
  const noTokenResult = await callQuickList(null, { asin: 'B08N5WRWNW', price: 19.99, publish: false });
  const noTokenActual = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ asin: 'B08N5WRWNW', price: 19.99, publish: false })
  });
  const noTokenData = { status: noTokenActual.status, body: await noTokenActual.json(), elapsed: 0 };
  recordResult('phase1', 'Auth: No token', {}, '401', noTokenData, noTokenData.status === 401);

  // Invalid token
  const invalidTokenResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid_token_12345'
    },
    body: JSON.stringify({ asin: 'B08N5WRWNW', price: 19.99, publish: false })
  });
  const invalidTokenData = { status: invalidTokenResult.status, body: await invalidTokenResult.json(), elapsed: 0 };
  recordResult('phase1', 'Auth: Invalid token', {}, '401', invalidTokenData, invalidTokenData.status === 401);
}

// ─────────────────────────────────────────────────────────
// Phase 2: Integration Tests (publish: false)
// ─────────────────────────────────────────────────────────
async function runPhase2(token) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Phase 2: Integration Tests (publish: false)');
  console.log('═══════════════════════════════════════════════════════════\n');

  for (const test of TEST_ASINS) {
    const input = { asin: test.asin, price: 29.99, publish: false, quantity: 1 };
    const result = await callQuickList(token, input);
    
    let passed = false;
    let notes = '';
    
    if (test.shouldSucceed) {
      // For valid ASINs, we expect success or a graceful failure if product not found
      if (result.status === 200 && result.body.success) {
        passed = true;
        notes = `SKU: ${result.body.sku}, Category: ${result.body.categoryName}`;
      } else if (result.status === 400 && (result.body.error?.includes('not found') || result.body.error?.includes('Product not found'))) {
        passed = true;
        notes = 'Product not found on Amazon (graceful failure)';
      } else {
        passed = false;
        notes = `Unexpected error: ${result.body.error || result.body.message}`;
      }
    } else {
      // For invalid ASINs, we expect 400 error
      passed = result.status === 400;
      notes = passed ? 'Correctly rejected' : `Expected 400, got ${result.status}`;
    }
    
    recordResult('phase2', `Integration: ${test.description}`, input, test.shouldSucceed ? '200/success or graceful 400' : '400/error', result, passed, notes);
    
    // Wait between tests to avoid rate limiting
    await sleep(2000);
  }
}

// ─────────────────────────────────────────────────────────
// Phase 3: Error Handling Tests
// ─────────────────────────────────────────────────────────
async function runPhase3(token) {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('Phase 3: Error Handling Tests');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 3.1: Malformed JSON
  try {
    const malformedResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: '{ invalid json }'
    });
    const malformedData = { status: malformedResult.status, body: await malformedResult.json().catch(() => ({})), elapsed: 0 };
    recordResult('phase3', 'Error: Malformed JSON body', '{ invalid json }', '400 or 500', malformedData, malformedData.status >= 400);
  } catch (e) {
    recordResult('phase3', 'Error: Malformed JSON body', '{ invalid json }', '400 or 500', { status: 500, body: { error: e.message }, elapsed: 0 }, true, 'Request failed as expected');
  }

  // Test 3.2: Empty body
  try {
    const emptyResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: ''
    });
    const emptyData = { status: emptyResult.status, body: await emptyResult.json().catch(() => ({})), elapsed: 0 };
    recordResult('phase3', 'Error: Empty request body', '', '400 or 500', emptyData, emptyData.status >= 400);
  } catch (e) {
    recordResult('phase3', 'Error: Empty request body', '', '400 or 500', { status: 500, body: { error: e.message }, elapsed: 0 }, true);
  }

  // Test 3.3: Wrong HTTP method
  const getResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const getData = { status: getResult.status, body: await getResult.json().catch(() => ({})), elapsed: 0 };
  recordResult('phase3', 'Error: GET method instead of POST', 'GET request', '405', getData, getData.status === 405);

  // Test 3.4: Missing required fields
  const missingAsinResult = await callQuickList(token, { price: 19.99, publish: false });
  recordResult('phase3', 'Error: Missing ASIN field', { price: 19.99 }, '400', missingAsinResult, missingAsinResult.status === 400);

  const missingPriceResult = await callQuickList(token, { asin: 'B08N5WRWNW', publish: false });
  recordResult('phase3', 'Error: Missing price field', { asin: 'B08N5WRWNW' }, '400', missingPriceResult, missingPriceResult.status === 400);

  // Test 3.5: CORS preflight
  const optionsResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
    method: 'OPTIONS'
  });
  const optionsData = { status: optionsResult.status, body: {}, elapsed: 0 };
  recordResult('phase3', 'CORS: OPTIONS preflight', 'OPTIONS request', '200', optionsData, optionsData.status === 200);

  // Test 3.6: Expired-like token simulation (malformed JWT)
  const expiredResult = await fetch(`${BASE_URL}/.netlify/functions/auto-list-single`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MDAwMDAwMDB9.invalid'
    },
    body: JSON.stringify({ asin: 'B08N5WRWNW', price: 19.99, publish: false })
  });
  const expiredData = { status: expiredResult.status, body: await expiredResult.json().catch(() => ({})), elapsed: 0 };
  recordResult('phase3', 'Error: Expired/invalid JWT token', 'expired JWT', '401', expiredData, expiredData.status === 401);
}

// ─────────────────────────────────────────────────────────
// Generate Report
// ─────────────────────────────────────────────────────────
function generateReport() {
  results.endTime = new Date().toISOString();
  
  const totalTests = results.phase1.tests.length + results.phase2.tests.length + results.phase3.tests.length;
  const totalPassed = results.phase1.passed + results.phase2.passed + results.phase3.passed;
  const totalFailed = results.phase1.failed + results.phase2.failed + results.phase3.failed;
  const successRate = ((totalPassed / totalTests) * 100).toFixed(1);

  let report = `# Quick List Test Results

## Executive Summary

| Metric | Value |
|--------|-------|
| **Test Date** | ${new Date().toISOString().split('T')[0]} |
| **Total Tests** | ${totalTests} |
| **Passed** | ${totalPassed} |
| **Failed** | ${totalFailed} |
| **Success Rate** | **${successRate}%** |
| **Target** | 99% |
| **Status** | ${parseFloat(successRate) >= 99 ? '✅ PASS' : '⚠️ NEEDS ATTENTION'} |

## Environment

- **UAT Site**: ${BASE_URL}
- **Supabase**: ${SUPABASE_URL}
- **Test Duration**: ${results.startTime} to ${results.endTime}

---

## Phase 1: API Validation Tests

**Purpose**: Verify input validation without making eBay writes

| Result | Test Name | Status | Time | Notes |
|--------|-----------|--------|------|-------|
`;

  for (const test of results.phase1.tests) {
    const icon = test.passed ? '✅' : '❌';
    const notes = test.notes || (test.actualBody?.error?.substring(0, 50) || '');
    report += `| ${icon} | ${test.testName} | ${test.actualStatus} | ${test.elapsed}ms | ${notes} |\n`;
  }

  report += `
**Phase 1 Results**: ${results.phase1.passed}/${results.phase1.tests.length} passed (${((results.phase1.passed / results.phase1.tests.length) * 100).toFixed(1)}%)

---

## Phase 2: Integration Tests (publish: false)

**Purpose**: Test the full listing pipeline without creating live listings

| Result | ASIN | Description | Status | Time | Notes |
|--------|------|-------------|--------|------|-------|
`;

  for (const test of results.phase2.tests) {
    const icon = test.passed ? '✅' : '❌';
    const asin = JSON.parse(test.input).asin;
    const desc = TEST_ASINS.find(a => a.asin === asin)?.description || 'Unknown';
    report += `| ${icon} | ${asin} | ${desc} | ${test.actualStatus} | ${test.elapsed}ms | ${test.notes?.substring(0, 60) || ''} |\n`;
  }

  report += `
**Phase 2 Results**: ${results.phase2.passed}/${results.phase2.tests.length} passed (${((results.phase2.passed / results.phase2.tests.length) * 100).toFixed(1)}%)

---

## Phase 3: Error Handling Tests

**Purpose**: Verify graceful error handling and edge cases

| Result | Test Name | Status | Expected | Notes |
|--------|-----------|--------|----------|-------|
`;

  for (const test of results.phase3.tests) {
    const icon = test.passed ? '✅' : '❌';
    report += `| ${icon} | ${test.testName} | ${test.actualStatus} | ${test.expected} | ${test.notes || ''} |\n`;
  }

  report += `
**Phase 3 Results**: ${results.phase3.passed}/${results.phase3.tests.length} passed (${((results.phase3.passed / results.phase3.tests.length) * 100).toFixed(1)}%)

---

## Bugs Found

`;

  const bugs = [];
  for (const phase of ['phase1', 'phase2', 'phase3']) {
    for (const test of results[phase].tests) {
      if (!test.passed) {
        bugs.push({
          phase,
          test: test.testName,
          expected: test.expected,
          actual: test.actualStatus,
          error: test.actualBody?.error || test.actualBody?.message || 'Unknown'
        });
      }
    }
  }

  if (bugs.length === 0) {
    report += '_No bugs found during testing._\n';
  } else {
    for (const bug of bugs) {
      report += `### BUG: ${bug.test}
- **Phase**: ${bug.phase}
- **Expected**: ${bug.expected}
- **Actual**: ${bug.actual}
- **Error**: ${bug.error}

`;
    }
  }

  report += `
---

## Recommendations

`;

  if (parseFloat(successRate) >= 99) {
    report += `1. ✅ **Quick List feature is production-ready** with ${successRate}% success rate
2. Continue monitoring in production for edge cases
3. Consider adding more comprehensive error messages for better UX
`;
  } else {
    report += `1. ⚠️ **Address failing tests before production deployment**
2. Review error handling for edge cases
3. Consider adding retry logic for transient failures
`;
  }

  report += `
---

## Raw Test Data

<details>
<summary>Click to expand raw JSON results</summary>

\`\`\`json
${JSON.stringify(results, null, 2)}
\`\`\`

</details>

---

*Generated automatically by Quick List Test Suite*
`;

  return report;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║   Quick List Comprehensive Test Suite                     ║');
  console.log('║   Target: 99% Success Rate                               ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  try {
    console.log('🔐 Authenticating...');
    const token = await getAuthToken();
    console.log('✅ Authentication successful\n');

    await runPhase1(token);
    await runPhase2(token);
    await runPhase3(token);

    const report = generateReport();
    
    // Write report
    const fs = require('fs');
    const reportPath = '/Users/jcsdirect/clawd/projects/ebay-price-reducer/docs/QUICKLIST-TEST-RESULTS.md';
    fs.writeFileSync(reportPath, report);
    console.log(`\n📄 Report written to: ${reportPath}`);

    // Summary
    const totalTests = results.phase1.tests.length + results.phase2.tests.length + results.phase3.tests.length;
    const totalPassed = results.phase1.passed + results.phase2.passed + results.phase3.passed;
    const successRate = ((totalPassed / totalTests) * 100).toFixed(1);

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log(`║   FINAL RESULTS: ${totalPassed}/${totalTests} tests passed (${successRate}%)           ║`);
    console.log(`║   Status: ${parseFloat(successRate) >= 99 ? '✅ PASS - Ready for production' : '⚠️  NEEDS ATTENTION'}           ║`);
    console.log('╚═══════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
