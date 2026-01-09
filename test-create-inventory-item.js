/**
 * Test: Create eBay Inventory Item
 * 
 * Tests Story 1 with a real ASIN, then cleans up.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Test ASIN: LEGO Dinosaur
const TEST_ASIN = 'B01KJEOCDW';

async function test() {
  console.log('🧪 Testing Create eBay Inventory Item\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Get Pete's user ID
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'petenelson13@gmail.com')
    .single();

  if (userError || !userData) {
    console.error('❌ Could not find Pete\'s user:', userError);
    return;
  }

  console.log(`📧 Testing with user: ${userData.email}`);
  console.log(`🆔 User ID: ${userData.id}\n`);

  // Generate a JWT token for Pete using admin API
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.email,
  });

  if (linkError) {
    console.error('❌ Could not generate link:', linkError);
    return;
  }

  // Extract the token from the link
  const token = linkData.properties?.hashed_token;
  
  // Verify the token to get a session
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: token,
  });

  if (verifyError || !verifyData.session) {
    console.error('❌ Could not verify token:', verifyError);
    return;
  }

  const authToken = verifyData.session.access_token;
  console.log('🔑 Got auth token\n');

  // Step 1: Create Inventory Item
  console.log(`📦 Creating inventory item for ASIN: ${TEST_ASIN}`);
  
  try {
    const createResponse = await fetch(`${API_BASE}/create-ebay-inventory-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        asin: TEST_ASIN,
        condition: 'NEW',
        quantity: 1
      })
    });

    const createResult = await createResponse.json();
    console.log(`📋 Response status: ${createResponse.status}`);
    console.log('📋 Result:', JSON.stringify(createResult, null, 2));

    if (!createResult.success) {
      console.error('❌ Failed to create inventory item');
      return;
    }

    const sku = createResult.sku;
    console.log(`\n✅ Inventory item created! SKU: ${sku}`);

    // Step 2: Clean up - delete the inventory item
    console.log(`\n🧹 Cleaning up: deleting SKU ${sku}`);

    const deleteResponse = await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ sku })
    });

    const deleteResult = await deleteResponse.json();
    console.log('🗑️ Delete result:', JSON.stringify(deleteResult, null, 2));

    if (deleteResult.success) {
      console.log('\n✅ Test complete! Inventory item created and cleaned up.');
    } else {
      console.log('\n⚠️ Test item created but cleanup failed. Manual cleanup needed.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

test().catch(console.error);
