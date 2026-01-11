/**
 * Regression Test Suite
 * 
 * Runs all story tests to ensure new features don't break existing functionality.
 * Run after every feature addition.
 */

const { execSync } = require('child_process');

console.log('='.repeat(70));
console.log('REGRESSION TEST SUITE - eBay Price Reducer');
console.log('='.repeat(70));
console.log('Running all story tests...\n');

const tests = [
  { name: 'Story 4A/4B: Category Functions', file: 'test-category-functions.js' },
  { name: 'Story 5: AI Title/Description', file: 'test-story-5.js' },
  { name: 'Story 6: Auto-List Multi-Category', file: 'test-story-6.js' }
];

let totalPassed = 0;
let totalFailed = 0;
const results = [];

for (const test of tests) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`Running: ${test.name}`);
  console.log(`${'─'.repeat(70)}`);
  
  try {
    const output = execSync(`node ${test.file}`, { 
      encoding: 'utf8',
      timeout: 120000,
      env: process.env
    });
    
    console.log(output);
    
    // Parse results from output
    const passMatch = output.match(/(\d+) passed/);
    const failMatch = output.match(/(\d+) failed/);
    
    const passed = passMatch ? parseInt(passMatch[1]) : 0;
    const failed = failMatch ? parseInt(failMatch[1]) : 0;
    
    totalPassed += passed;
    totalFailed += failed;
    
    results.push({
      name: test.name,
      passed,
      failed,
      status: failed === 0 ? '✅' : '❌'
    });
    
  } catch (error) {
    console.error(`Error running ${test.name}:`, error.message);
    results.push({
      name: test.name,
      passed: 0,
      failed: 1,
      status: '❌ CRASH'
    });
    totalFailed++;
  }
}

// Summary
console.log('\n' + '='.repeat(70));
console.log('REGRESSION TEST SUMMARY');
console.log('='.repeat(70));
console.log('\nResults by Story:');
console.log('─'.repeat(70));

for (const r of results) {
  console.log(`${r.status} ${r.name}: ${r.passed} passed, ${r.failed} failed`);
}

console.log('─'.repeat(70));
console.log(`\nTOTAL: ${totalPassed} passed, ${totalFailed} failed`);

if (totalFailed === 0) {
  console.log('\n✅ ALL REGRESSION TESTS PASSED');
} else {
  console.log('\n❌ REGRESSION FAILURES DETECTED - FIX BEFORE PROCEEDING');
}

console.log('='.repeat(70));

process.exit(totalFailed > 0 ? 1 : 0);
