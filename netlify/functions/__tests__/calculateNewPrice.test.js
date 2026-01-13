/**
 * Tests for calculateNewPrice function
 * F-PRC002: Multi-type reduction support
 */

// Extract the function for testing
function calculateNewPrice(listing, strategy = null) {
  const currentPrice = parseFloat(listing.current_price);
  const minimumPrice = parseFloat(listing.minimum_price);
  
  // Determine reduction parameters from strategy or fallback to listing defaults
  let reductionType = 'percentage';
  let reductionValue = parseFloat(listing.reduction_percentage || 2); // Default 2%
  
  if (strategy) {
    reductionType = strategy.reduction_type || 'percentage';
    reductionValue = parseFloat(strategy.reduction_amount);
  }
  
  // Calculate reduction based on type
  let reduction;
  if (reductionType === 'dollar') {
    // Dollar amount - subtract fixed amount
    reduction = reductionValue;
  } else {
    // Percentage - calculate percentage of current price
    reduction = currentPrice * (reductionValue / 100);
  }
  
  let newPrice = currentPrice - reduction;
  
  // Round to 2 decimal places
  newPrice = Math.round(newPrice * 100) / 100;
  
  // Ensure we don't go below minimum
  const actualReduction = currentPrice - Math.max(newPrice, minimumPrice);
  if (newPrice < minimumPrice) {
    newPrice = minimumPrice;
  }
  
  return {
    newPrice,
    reductionType,
    reductionValue,
    reductionApplied: Math.round(actualReduction * 100) / 100
  };
}

// Test cases
const testCases = [
  {
    name: 'Percentage reduction - 10% of $50',
    listing: { current_price: 50.00, minimum_price: 40.00, reduction_percentage: 10 },
    strategy: { reduction_type: 'percentage', reduction_amount: 10 },
    expected: { newPrice: 45.00, reductionType: 'percentage' }
  },
  {
    name: 'Dollar reduction - $3 off $50',
    listing: { current_price: 50.00, minimum_price: 40.00 },
    strategy: { reduction_type: 'dollar', reduction_amount: 3.00 },
    expected: { newPrice: 47.00, reductionType: 'dollar' }
  },
  {
    name: 'Percentage hits minimum - 10% of $42 with $40 min',
    listing: { current_price: 42.00, minimum_price: 40.00 },
    strategy: { reduction_type: 'percentage', reduction_amount: 10 },
    expected: { newPrice: 40.00, reductionType: 'percentage' }
  },
  {
    name: 'Dollar hits minimum - $3 off $41 with $40 min',
    listing: { current_price: 41.00, minimum_price: 40.00 },
    strategy: { reduction_type: 'dollar', reduction_amount: 3.00 },
    expected: { newPrice: 40.00, reductionType: 'dollar' }
  },
  {
    name: 'Already at minimum - no change',
    listing: { current_price: 40.00, minimum_price: 40.00 },
    strategy: { reduction_type: 'dollar', reduction_amount: 5.00 },
    expected: { newPrice: 40.00, reductionType: 'dollar' }
  },
  {
    name: 'No strategy - uses listing fallback (5%)',
    listing: { current_price: 50.00, minimum_price: 40.00, reduction_percentage: 5 },
    strategy: null,
    expected: { newPrice: 47.50, reductionType: 'percentage' }
  },
  {
    name: 'No strategy, no listing percentage - uses default 2%',
    listing: { current_price: 100.00, minimum_price: 50.00 },
    strategy: null,
    expected: { newPrice: 98.00, reductionType: 'percentage' }
  },
  {
    name: 'Dollar reduction larger than margin - caps at minimum',
    listing: { current_price: 41.00, minimum_price: 40.00 },
    strategy: { reduction_type: 'dollar', reduction_amount: 5.00 },
    expected: { newPrice: 40.00, reductionType: 'dollar', reductionApplied: 1.00 }
  }
];

// Run tests
console.log('🧪 Testing calculateNewPrice (F-PRC002)\n');
let passed = 0;
let failed = 0;

testCases.forEach((tc, i) => {
  const result = calculateNewPrice(tc.listing, tc.strategy);
  
  const priceMatch = result.newPrice === tc.expected.newPrice;
  const typeMatch = result.reductionType === tc.expected.reductionType;
  const reductionMatch = tc.expected.reductionApplied === undefined || 
                         result.reductionApplied === tc.expected.reductionApplied;
  
  const allPass = priceMatch && typeMatch && reductionMatch;
  
  if (allPass) {
    console.log(`✅ Test ${i + 1}: ${tc.name}`);
    passed++;
  } else {
    console.log(`❌ Test ${i + 1}: ${tc.name}`);
    console.log(`   Expected: $${tc.expected.newPrice} (${tc.expected.reductionType})`);
    console.log(`   Got:      $${result.newPrice} (${result.reductionType})`);
    if (tc.expected.reductionApplied !== undefined) {
      console.log(`   Expected reduction: $${tc.expected.reductionApplied}, Got: $${result.reductionApplied}`);
    }
    failed++;
  }
});

console.log(`\n📊 Results: ${passed}/${testCases.length} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
