/**
 * Test: Full eBay Listing Flow
 * 
 * Tests Stories 1-3:
 * 1. Create inventory item from ASIN
 * 2. Create offer with price and policies
 * 3. (Optional) Publish to make live
 * 4. Clean up test data
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

// Test ASIN: LEGO Dinosaur
const TEST_ASIN = 'B01KJEOCDW';
const TEST_PRICE = '24.99';

// Set to true to actually publish (creates real listing!)
const PUBLISH_LISTING = false;

async function test() {
  console.log('🧪 Testing Full eBay Listing Flow\n');
  console.log(`📦 ASIN: ${TEST_ASIN}`);
  console.log(`💰 Price: $${TEST_PRICE}`);
  console.log(`🔴 Publish: ${PUBLISH_LISTING ? 'YES (will create real listing!)' : 'NO (test only)'}\n`);
  console.log('─'.repeat(50) + '\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Get Pete's user
  const { data: userData } = await supabase
    .from('users')
    .select('id, email')
    .eq('email', 'petenelson13@gmail.com')
    .single();

  if (!userData) {
    console.error('❌ Could not find user');
    return;
  }

  // Generate auth token
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.email,
  });
  
  const { data: verifyData } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties?.hashed_token,
  });

  const authToken = verifyData.session.access_token;
  console.log('🔑 Got auth token\n');

  let sku = null;
  let offerId = null;
  let listingId = null;

  try {
    // ───────────────────────────────────────────────
    // STEP 1: Create Inventory Item
    // ───────────────────────────────────────────────
    console.log('📦 STEP 1: Create Inventory Item');
    
    const createItemResponse = await fetch(`${API_BASE}/create-ebay-inventory-item`, {
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

    const createItemResult = await createItemResponse.json();
    
    if (!createItemResult.success) {
      console.error('❌ Failed:', createItemResult);
      return;
    }

    sku = createItemResult.sku;
    console.log(`   ✅ Created inventory item: ${sku}`);
    console.log(`   📝 Title: ${createItemResult.title}\n`);

    // ───────────────────────────────────────────────
    // STEP 2: Create Offer
    // ───────────────────────────────────────────────
    console.log('📋 STEP 2: Create Offer');
    
    const createOfferResponse = await fetch(`${API_BASE}/create-ebay-offer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        sku: sku,
        price: TEST_PRICE,
        quantity: 1,
        categoryHint: 'building_toys'  // Will map to category 19006
      })
    });

    const createOfferResult = await createOfferResponse.json();
    console.log(`   Response status: ${createOfferResponse.status}`);
    
    if (!createOfferResult.success) {
      console.error('❌ Failed:', JSON.stringify(createOfferResult, null, 2));
      throw new Error('Offer creation failed');
    }

    offerId = createOfferResult.offerId;
    console.log(`   ✅ Created offer: ${offerId}`);
    console.log(`   💰 Price: $${createOfferResult.price}\n`);

    // ───────────────────────────────────────────────
    // STEP 3: Publish (Optional)
    // ───────────────────────────────────────────────
    if (PUBLISH_LISTING) {
      console.log('🚀 STEP 3: Publish Offer');
      
      const publishResponse = await fetch(`${API_BASE}/publish-ebay-offer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ offerId })
      });

      const publishResult = await publishResponse.json();
      
      if (!publishResult.success) {
        console.error('❌ Publish failed:', JSON.stringify(publishResult, null, 2));
        throw new Error('Publish failed');
      }

      listingId = publishResult.listingId;
      console.log(`   ✅ Published! Listing ID: ${listingId}`);
      console.log(`   🔗 URL: ${publishResult.listingUrl}\n`);
    } else {
      console.log('⏭️ STEP 3: Skipping publish (test mode)\n');
    }

    console.log('─'.repeat(50));
    console.log('\n✅ TEST PASSED!\n');

  } finally {
    // ───────────────────────────────────────────────
    // CLEANUP
    // ───────────────────────────────────────────────
    console.log('🧹 CLEANUP');

    if (offerId && !listingId) {
      // Only delete offer if not published
      console.log(`   Deleting offer ${offerId}...`);
      await fetch(`${API_BASE}/delete-ebay-offer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ offerId })
      });
      console.log('   ✅ Offer deleted');
    }

    if (sku && !listingId) {
      // Only delete inventory item if not published
      console.log(`   Deleting inventory item ${sku}...`);
      await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ sku })
      });
      console.log('   ✅ Inventory item deleted');
    }

    if (listingId) {
      console.log(`   ⚠️ Listing ${listingId} is live - must end manually in Seller Hub`);
    }

    console.log('\n🏁 Done!\n');
  }
}

test().catch(console.error);
