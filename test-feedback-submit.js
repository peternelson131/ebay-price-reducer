/**
 * Test script for submit-feedback endpoint
 * Run with: node test-feedback-submit.js
 * 
 * Prerequisites:
 * - Set SUPABASE_URL, SUPABASE_ANON_KEY in .env.local
 * - Have a valid user session
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const https = require('https');
const http = require('http');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// API base URL - use local dev or production
const API_BASE = process.env.API_BASE || 'http://localhost:8888';

async function getAuthToken() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  // Sign in with test credentials (update these)
  const email = process.env.TEST_EMAIL || 'peternelson131@outlook.com';
  const password = process.env.TEST_PASSWORD || 'sPx6T3JbVGFjco';
  
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  
  if (error) {
    throw new Error(`Auth failed: ${error.message}`);
  }
  
  return data.session.access_token;
}

async function testSubmitFeedback() {
  console.log('Testing submit-feedback endpoint...\n');
  
  // Get auth token
  console.log('1. Getting auth token...');
  const token = await getAuthToken();
  console.log('   ✅ Got auth token\n');
  
  const apiUrl = `${API_BASE}/.netlify/functions/submit-feedback`;
  
  // Test 1: Submit feature request (no screenshot required)
  console.log('2. Testing feature request (no screenshot)...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'feature_request',
        description: 'Test feature request: Add dark mode support'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('   ✅ Feature request submitted:', data.feedback.id);
    } else {
      console.log('   ❌ Failed:', data.error);
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  console.log();
  
  // Test 2: Submit bug without screenshot (should fail)
  console.log('3. Testing bug report without screenshot (should fail)...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'bug',
        description: 'Test bug: Something is broken'
      })
    });
    
    const data = await response.json();
    if (response.status === 400 && data.error.includes('Screenshot is required')) {
      console.log('   ✅ Correctly rejected bug without screenshot');
    } else {
      console.log('   ❌ Unexpected response:', data);
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  console.log();
  
  // Test 3: Invalid category
  console.log('4. Testing invalid category (should fail)...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'invalid_category',
        description: 'Test'
      })
    });
    
    const data = await response.json();
    if (response.status === 400 && data.error.includes('Invalid category')) {
      console.log('   ✅ Correctly rejected invalid category');
    } else {
      console.log('   ❌ Unexpected response:', data);
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  console.log();
  
  // Test 4: Submit 'other' category
  console.log('5. Testing "other" category...');
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        category: 'other',
        description: 'General feedback: The app is great!'
      })
    });
    
    const data = await response.json();
    if (response.ok && data.success) {
      console.log('   ✅ Other feedback submitted:', data.feedback.id);
    } else {
      console.log('   ❌ Failed:', data.error);
    }
  } catch (err) {
    console.log('   ❌ Error:', err.message);
  }
  console.log();
  
  console.log('Testing complete!');
}

// Run if executed directly
if (require.main === module) {
  testSubmitFeedback().catch(console.error);
}

module.exports = { testSubmitFeedback };
