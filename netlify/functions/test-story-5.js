/**
 * Story 5: Test Plan for AI Title & Description Generation
 * 
 * Run with: node test-story-5.js
 * Requires ANTHROPIC_API_KEY env var for integration tests
 */

const { 
  generateListingContent, 
  safeTrimTitle, 
  sanitizeContent 
} = require('./generate-ebay-listing-content.js');

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logResult(testId, name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status} | ${testId}: ${name}`);
  if (details) console.log(`       ${details}`);
  
  results.tests.push({ testId, name, passed, details });
  if (passed) results.passed++;
  else results.failed++;
}

// ==================== UNIT TESTS ====================

function testUnitSafeTrimTitle() {
  console.log('\n--- Unit Tests: safeTrimTitle ---\n');
  
  // T7 variant: 95-char title should be trimmed to ≤80
  const longTitle = "LEGO Creator 3in1 Mighty Dinosaurs 31058 Building Toy Set for Kids Boys Girls Ages 7-12 174 Pieces";
  const trimmed = safeTrimTitle(longTitle, 80);
  const t7pass = trimmed.length <= 80;
  logResult('T7-unit', 'safeTrimTitle 95-char → ≤80', t7pass, 
    `Length: ${trimmed.length}, Result: "${trimmed}"`);
  
  // Edge: exactly 80 chars should pass through
  const exact80 = 'A'.repeat(80);
  const result80 = safeTrimTitle(exact80);
  logResult('T7b', 'safeTrimTitle exactly 80 chars unchanged', 
    result80.length === 80 && result80 === exact80);
  
  // Edge: empty/null handling
  const emptyResult = safeTrimTitle('');
  const nullResult = safeTrimTitle(null);
  logResult('T7c', 'safeTrimTitle handles empty/null', 
    emptyResult === '' && nullResult === '');
}

function testUnitSanitizeContent() {
  console.log('\n--- Unit Tests: sanitizeContent ---\n');
  
  // T4: Remove Amazon/Prime references
  const amazonText = "This is an Amazon product. Prime shipping available. FBA fulfilled.";
  const sanitized = sanitizeContent(amazonText);
  const hasAmazon = /amazon/i.test(sanitized);
  const hasPrime = /prime/i.test(sanitized);
  const hasFBA = /\bFBA\b/i.test(sanitized);
  
  logResult('T4-unit', 'sanitizeContent removes Amazon/Prime/FBA', 
    !hasAmazon && !hasPrime && !hasFBA,
    `Result: "${sanitized}"`);
  
  // Additional sanitization check
  const bestSeller = "Amazon's Choice Best Seller product";
  const sanitized2 = sanitizeContent(bestSeller);
  logResult('T4b', "sanitizeContent removes Amazon's Choice/Best Seller",
    !/Amazon's Choice/i.test(sanitized2) && !/Best Seller/i.test(sanitized2),
    `Result: "${sanitized2}"`);
}

// ==================== INTEGRATION TESTS ====================

async function testT1_LongTitle() {
  console.log('\n--- T1: Long Title Optimization ---\n');
  
  const input = {
    title: "LEGO Creator 3in1 Mighty Dinosaurs 31058 Building Toy Set for Kids, Boys, and Girls Ages 7-12 (174 Pieces)",
    brand: "LEGO",
    model: "31058",
    category: "Toys"
  };
  
  const startTime = Date.now();
  const result = await generateListingContent(input);
  const elapsed = Date.now() - startTime;
  
  const titleLength = result.title.length;
  const hasLEGO = /LEGO/i.test(result.title);
  const hasDinosaur = /dinosaur/i.test(result.title);
  const has31058 = /31058/.test(result.title);
  
  const passed = titleLength <= 80 && hasLEGO && (hasDinosaur || has31058);
  
  logResult('T1', 'Long title → ≤80 chars with key terms', passed,
    `Length: ${titleLength}, Title: "${result.title}", Has LEGO: ${hasLEGO}, Has Dinosaur: ${hasDinosaur}, Has 31058: ${has31058}`);
  
  return { result, elapsed };
}

async function testT2_BrandModel() {
  console.log('\n--- T2: Brand & Model Inclusion ---\n');
  
  const input = {
    title: "Smartphone",
    brand: "Apple",
    model: "iPhone 15",
    color: "Black",
    category: "Electronics"
  };
  
  const result = await generateListingContent(input);
  
  const hasApple = /Apple/i.test(result.title);
  const hasiPhone15 = /iPhone\s*15/i.test(result.title);
  
  const passed = hasApple && hasiPhone15;
  
  logResult('T2', 'Title contains brand "Apple" and model "iPhone 15"', passed,
    `Title: "${result.title}", Has Apple: ${hasApple}, Has iPhone 15: ${hasiPhone15}`);
  
  return result;
}

async function testT3_FeaturesAsList() {
  console.log('\n--- T3: Features as HTML List ---\n');
  
  const input = {
    title: "Wireless Bluetooth Headphones",
    brand: "Sony",
    features: [
      "Active Noise Cancellation",
      "30-hour battery life",
      "Foldable design",
      "Built-in microphone",
      "Bluetooth 5.0"
    ]
  };
  
  const result = await generateListingContent(input);
  
  const hasUL = /<ul>/i.test(result.description);
  const hasLI = /<li>/i.test(result.description);
  const liCount = (result.description.match(/<li>/gi) || []).length;
  
  const passed = hasUL && hasLI && liCount >= 3;
  
  logResult('T3', 'Description has <ul> with <li> items', passed,
    `Has <ul>: ${hasUL}, Has <li>: ${hasLI}, <li> count: ${liCount}`);
  
  return result;
}

async function testT4_NoAmazonPrime() {
  console.log('\n--- T4: No Amazon/Prime References ---\n');
  
  const input = {
    title: "Amazon Basics USB Cable Prime Shipping",
    description: "Buy on Amazon for Prime delivery. FBA fulfilled.",
    brand: "AmazonBasics",
    features: [
      "Amazon's Choice product",
      "Prime eligible",
      "Best Seller in category"
    ]
  };
  
  const result = await generateListingContent(input);
  
  const combinedText = result.title + ' ' + result.description;
  const hasAmazon = /\bAmazon\b/i.test(combinedText);
  const hasPrime = /\bPrime\b/i.test(combinedText);
  
  const passed = !hasAmazon && !hasPrime;
  
  logResult('T4', 'Output does NOT contain "Amazon" or "Prime"', passed,
    `Has Amazon: ${hasAmazon}, Has Prime: ${hasPrime}`);
  
  return result;
}

async function testT5_MissingData() {
  console.log('\n--- T5: Handle Missing Data ---\n');
  
  const input = {
    title: "Generic Product",
    // No description, no features, minimal data
  };
  
  let passed = false;
  let error = null;
  let result = null;
  
  try {
    result = await generateListingContent(input);
    passed = result && 
             typeof result.title === 'string' && 
             typeof result.description === 'string' &&
             result.title.length > 0;
  } catch (e) {
    error = e.message;
  }
  
  logResult('T5', 'No crash with missing description/features', passed,
    error ? `Error: ${error}` : `Title: "${result?.title}", Desc length: ${result?.description?.length}`);
  
  return result;
}

async function testT6_ResponseTime() {
  console.log('\n--- T6: Response Time < 5 seconds ---\n');
  
  const input = {
    title: "Test Product for Speed Check",
    brand: "TestBrand",
    features: ["Feature 1", "Feature 2"]
  };
  
  const startTime = Date.now();
  const result = await generateListingContent(input);
  const elapsed = Date.now() - startTime;
  
  const passed = elapsed < 5000;
  
  logResult('T6', 'Completes in < 5 seconds', passed,
    `Elapsed: ${elapsed}ms`);
  
  return { result, elapsed };
}

async function testT7_95CharForced() {
  console.log('\n--- T7: Force 95-char Title Trimmed ---\n');
  
  // Create a scenario that might generate a long title
  const input = {
    title: "Super Ultra Premium Deluxe Professional Grade Heavy Duty Industrial Commercial Quality Extended Range",
    brand: "ACME Corporation International",
    model: "XL-9000 PRO MAX ULTRA EDITION",
    color: "Midnight Black",
    size: "Extra Large"
  };
  
  const result = await generateListingContent(input);
  
  const passed = result.title.length <= 80;
  
  logResult('T7', 'Even with long input, output ≤80 chars', passed,
    `Length: ${result.title.length}, Title: "${result.title}"`);
  
  return result;
}

// ==================== MAIN TEST RUNNER ====================

async function runAllTests() {
  console.log('='.repeat(60));
  console.log('Story 5: AI Title & Description Generation - Test Suite');
  console.log('='.repeat(60));
  
  // Check for API key
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('\n⚠️  WARNING: ANTHROPIC_API_KEY not set.');
    console.log('   Integration tests will use fallback content generation.\n');
  }
  
  // Unit tests (no API needed)
  testUnitSafeTrimTitle();
  testUnitSanitizeContent();
  
  // Integration tests
  try {
    await testT1_LongTitle();
    await testT2_BrandModel();
    await testT3_FeaturesAsList();
    await testT4_NoAmazonPrime();
    await testT5_MissingData();
    await testT6_ResponseTime();
    await testT7_95CharForced();
  } catch (error) {
    console.error('\n❌ Test suite error:', error.message);
  }
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Total:  ${results.tests.length}`);
  console.log('='.repeat(60));
  
  // Exit with error code if any tests failed
  if (results.failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch(console.error);
