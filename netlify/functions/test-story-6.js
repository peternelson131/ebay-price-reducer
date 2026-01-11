/**
 * Story 6: Auto-List Single - Multi-Category Test Suite
 * 
 * Tests end-to-end listing flow across different product categories.
 * These tests use REAL eBay APIs - be careful with publish=true!
 * 
 * Run: node test-story-6.js
 * 
 * Note: These tests require:
 * - EBAY_CLIENT_ID, EBAY_CLIENT_SECRET (for category APIs)
 * - ANTHROPIC_API_KEY (for AI content generation)
 * - Supabase credentials (for user auth and Keepa key)
 * - Valid eBay OAuth token in database
 */

const { getCategorySuggestion } = require('./get-ebay-category-suggestion');
const { getCategoryAspects } = require('./get-ebay-category-aspects');
const { generateListingContent } = require('./generate-ebay-listing-content');

// Test products with realistic titles for category detection
const TEST_PRODUCTS = [
  {
    name: 'T1: Toys (LEGO)',
    asin: 'B01KJEOCDW',
    mockTitle: 'LEGO Creator 3in1 Mighty Dinosaurs 31058 Building Toy Set for Kids',
    expectedCategory: /lego|toy|building/i,
    expectedBrand: 'LEGO'
  },
  {
    name: 'T2: Electronics (Headphones)',
    asin: 'B09V3KXJPB',
    mockTitle: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones Bluetooth Over-Ear',
    expectedCategory: /headphone|audio|electronic/i,
    expectedBrand: 'Sony'
  },
  {
    name: 'T3: Video Games',
    asin: 'B0CHX3PXKH',
    mockTitle: 'The Legend of Zelda: Tears of the Kingdom Nintendo Switch Video Game',
    expectedCategory: /game|video|gaming/i,
    expectedBrand: 'Nintendo'
  },
  {
    name: 'T4: Home & Kitchen',
    asin: 'B08N5WRWNW',
    mockTitle: 'Ninja AF101 Air Fryer 4 Quart Black Kitchen Appliance Crisps Roasts',
    expectedCategory: /home|kitchen|appliance|fryer/i,
    expectedBrand: 'Ninja'
  },
  {
    name: 'T5: Books',
    asin: 'B07FZ8S74R',
    mockTitle: 'Atomic Habits: An Easy & Proven Way to Build Good Habits Paperback Book',
    expectedCategory: /book/i,
    expectedBrand: null
  }
];

async function runTests() {
  console.log('='.repeat(70));
  console.log('STORY 6: Auto-List Multi-Category Tests');
  console.log('='.repeat(70));
  console.log('Testing category detection and AI content for various product types\n');

  let passed = 0;
  let failed = 0;

  // For each test product, we'll simulate the key steps without actually calling eBay's
  // inventory/offer APIs (which require full auth). We test:
  // 1. Category suggestion works
  // 2. Aspects retrieval works  
  // 3. AI content generation works
  
  for (const test of TEST_PRODUCTS) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`${test.name}: ${test.asin}`);
    console.log(`${'─'.repeat(70)}`);

    try {
      const startTime = Date.now();

      // Use realistic product title for category detection
      const mockTitle = test.mockTitle;
      
      // Step 1: Get category suggestion
      console.log('  → Getting category suggestion...');
      const categoryResult = await getCategorySuggestion(mockTitle);
      
      if (!categoryResult.categoryId) {
        console.log(`  ❌ FAIL: No category returned`);
        failed++;
        continue;
      }
      
      console.log(`  ✓ Category: ${categoryResult.categoryId} - ${categoryResult.categoryName}`);
      
      // Step 2: Get aspects
      console.log('  → Getting required aspects...');
      const aspectsResult = await getCategoryAspects(categoryResult.categoryId);
      console.log(`  ✓ Aspects: ${aspectsResult.aspects?.length || 0} required`);
      if (aspectsResult.aspects?.length > 0) {
        console.log(`    Names: ${aspectsResult.aspects.map(a => a.name).join(', ')}`);
      }

      // Step 3: Generate AI content
      console.log('  → Generating AI content...');
      const aiResult = await generateListingContent({
        title: mockTitle,
        features: ['Feature 1', 'Feature 2', 'Feature 3'],
        brand: test.expectedBrand || 'Generic',
        category: categoryResult.categoryName
      });
      
      console.log(`  ✓ AI Title: "${aiResult.title}" (${aiResult.generatedTitleLength} chars)`);
      
      const elapsed = Date.now() - startTime;

      // Validate
      const titleValid = aiResult.title && aiResult.generatedTitleLength <= 80;
      const categoryValid = categoryResult.categoryId && categoryResult.categoryName;
      const timeValid = elapsed < 10000; // 10 second max for non-Keepa flow

      if (titleValid && categoryValid && timeValid) {
        console.log(`  ✅ PASS (${elapsed}ms)`);
        passed++;
      } else {
        console.log(`  ❌ FAIL: title=${titleValid}, category=${categoryValid}, time=${timeValid}`);
        failed++;
      }

    } catch (error) {
      console.log(`  ❌ ERROR: ${error.message}`);
      failed++;
    }
  }

  // Additional unit tests
  console.log(`\n${'─'.repeat(70)}`);
  console.log('Additional Validation Tests');
  console.log(`${'─'.repeat(70)}`);

  // T6: Invalid ASIN format validation
  console.log('\n  T6: Invalid ASIN validation');
  const invalidAsins = ['', 'INVALID', 'A123456789', '12345'];
  let allInvalid = true;
  for (const asin of invalidAsins) {
    const isValid = /^B[0-9A-Z]{9}$/.test(asin);
    if (isValid) {
      console.log(`    ❌ "${asin}" incorrectly passed validation`);
      allInvalid = false;
    }
  }
  if (allInvalid) {
    console.log('  ✅ PASS: All invalid ASINs correctly rejected');
    passed++;
  } else {
    failed++;
  }

  // T7: Valid ASIN format validation
  console.log('\n  T7: Valid ASIN validation');
  const validAsins = ['B01KJEOCDW', 'B0DGPMKPV6', 'B09V3KXJPB'];
  let allValid = true;
  for (const asin of validAsins) {
    const isValid = /^B[0-9A-Z]{9}$/.test(asin);
    if (!isValid) {
      console.log(`    ❌ "${asin}" incorrectly failed validation`);
      allValid = false;
    }
  }
  if (allValid) {
    console.log('  ✅ PASS: All valid ASINs correctly accepted');
    passed++;
  } else {
    failed++;
  }

  // T8: Price validation
  console.log('\n  T8: Price validation');
  const priceTests = [
    { value: 24.99, valid: true },
    { value: '19.99', valid: true },
    { value: 0, valid: false },
    { value: -5, valid: false },
    { value: 'abc', valid: false },
    { value: null, valid: false }
  ];
  let priceTestsPassed = true;
  for (const pt of priceTests) {
    const isValid = !!(pt.value && !isNaN(parseFloat(pt.value)) && parseFloat(pt.value) > 0);
    if (isValid !== pt.valid) {
      console.log(`    ❌ Price ${pt.value}: expected ${pt.valid}, got ${isValid}`);
      priceTestsPassed = false;
    }
  }
  if (priceTestsPassed) {
    console.log('  ✅ PASS: Price validation works correctly');
    passed++;
  } else {
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);
  console.log('='.repeat(70));

  if (failed === 0) {
    console.log('\n✅ ALL TESTS PASSED');
  } else {
    console.log('\n❌ SOME TESTS FAILED');
  }

  return { passed, failed };
}

// Run if executed directly
if (require.main === module) {
  runTests().catch(console.error);
}

module.exports = { runTests };
