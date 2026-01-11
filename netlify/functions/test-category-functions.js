/**
 * Test Script for Story 4A and 4B
 * 
 * Run with: node test-category-functions.js
 * Requires: EBAY_CLIENT_ID, EBAY_CLIENT_SECRET in environment
 */

require('dotenv').config({ path: '../../.env' });

const { getCategorySuggestion } = require('./get-ebay-category-suggestion');
const { getCategoryAspects } = require('./get-ebay-category-aspects');

async function runTests() {
  console.log('='.repeat(60));
  console.log('STORY 4A: Category Suggestion Tests');
  console.log('='.repeat(60));
  
  // Test T1: LEGO product
  console.log('\n--- T1: LEGO product ---');
  try {
    const result = await getCategorySuggestion('LEGO Creator 3-in-1 Mighty Dinosaur 31058');
    console.log('Category ID:', result.categoryId);
    console.log('Category Name:', result.categoryName);
    console.log('Response Time:', result.responseTimeMs || 'N/A', 'ms');
    
    const pass = result.categoryId && result.categoryName?.toLowerCase().includes('lego');
    console.log('PASS:', pass ? '✅' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌');
  }
  
  // Test T2: Electronics
  console.log('\n--- T2: Electronics (iPhone) ---');
  try {
    const result = await getCategorySuggestion('Apple iPhone 15 Pro Max 256GB');
    console.log('Category ID:', result.categoryId);
    console.log('Category Name:', result.categoryName);
    
    const pass = result.categoryId && 
      (result.categoryName?.toLowerCase().includes('phone') || 
       result.categoryName?.toLowerCase().includes('cell'));
    console.log('PASS:', pass ? '✅' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌');
  }
  
  // Test T3: Empty string
  console.log('\n--- T3: Empty string ---');
  try {
    const result = await getCategorySuggestion('');
    console.log('Result:', result);
    const pass = result.categoryId === null && result.error;
    console.log('PASS:', pass ? '✅' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌ (should not throw)');
  }
  
  // Test T4: Gibberish
  console.log('\n--- T4: Gibberish input ---');
  try {
    const result = await getCategorySuggestion('asdfghjkl123');
    console.log('Category ID:', result.categoryId);
    console.log('Category Name:', result.categoryName);
    // Should either return null or some generic category, but not crash
    console.log('PASS: ✅ (did not crash)');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌ (should not throw)');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('STORY 4B: Category Aspects Tests');
  console.log('='.repeat(60));
  
  // First get a real category ID from the LEGO test
  let legoCategoryId = '183446'; // Default LEGO category
  let phoneCategoryId = '9355';  // Cell Phones
  
  try {
    const legoResult = await getCategorySuggestion('LEGO Creator 3-in-1 Mighty Dinosaur 31058');
    if (legoResult.categoryId) {
      legoCategoryId = legoResult.categoryId;
    }
  } catch (e) {}
  
  // Test T1: LEGO category aspects
  console.log('\n--- T1: LEGO category aspects ---');
  try {
    const result = await getCategoryAspects(legoCategoryId);
    console.log('Category ID:', result.categoryId);
    console.log('Required Aspects:', result.requiredCount);
    console.log('Aspect Names:', result.aspects.map(a => a.name).join(', '));
    
    const hasBrand = result.aspects.some(a => a.name.toLowerCase().includes('brand'));
    console.log('Has Brand aspect:', hasBrand ? '✅' : '❌');
    console.log('PASS:', result.aspects.length > 0 ? '✅' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌');
  }
  
  // Test T2: Cell Phones category
  console.log('\n--- T2: Cell Phones category aspects ---');
  try {
    const result = await getCategoryAspects(phoneCategoryId);
    console.log('Category ID:', result.categoryId);
    console.log('Required Aspects:', result.requiredCount);
    console.log('Aspect Names:', result.aspects.map(a => a.name).join(', '));
    console.log('PASS:', result.aspects.length > 0 ? '✅' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌');
  }
  
  // Test T3: Invalid category ID
  console.log('\n--- T3: Invalid category ID ---');
  try {
    const result = await getCategoryAspects('99999999');
    console.log('Result:', result);
    const pass = result.aspects.length === 0 || result.error;
    console.log('PASS:', pass ? '✅ (handled gracefully)' : '❌');
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌ (should not throw)');
  }
  
  // Test T4: Verify structure
  console.log('\n--- T4: Verify aspect structure ---');
  try {
    const result = await getCategoryAspects(phoneCategoryId, false); // Get all aspects
    if (result.aspects.length > 0) {
      const sample = result.aspects[0];
      console.log('Sample aspect:', JSON.stringify(sample, null, 2));
      
      const hasName = 'name' in sample;
      const hasRequired = 'required' in sample;
      const hasValues = 'values' in sample && Array.isArray(sample.values);
      
      console.log('Has name:', hasName ? '✅' : '❌');
      console.log('Has required:', hasRequired ? '✅' : '❌');
      console.log('Has values array:', hasValues ? '✅' : '❌');
      console.log('PASS:', (hasName && hasRequired && hasValues) ? '✅' : '❌');
    } else {
      console.log('PASS: ❌ (no aspects to verify)');
    }
  } catch (error) {
    console.log('ERROR:', error.message);
    console.log('PASS: ❌');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('Tests complete');
  console.log('='.repeat(60));
}

runTests().catch(console.error);
