#!/usr/bin/env node
/**
 * Seed Script: Auto-Upload Task Feature
 * 
 * Creates test data to verify the auto-upload task feature:
 * 1. Creates a CRM product with an ASIN
 * 2. Creates an accepted ASIN correlation
 * 3. You can then upload a video to the product and verify:
 *    - video_title is auto-generated
 *    - influencer_tasks are auto-created
 * 
 * Usage:
 *   node scripts/seed-upload-task-feature.js
 * 
 * Environment:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key
 *   TEST_USER_ID - UUID of test user (optional, uses first user if not set)
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('🌱 Seeding test data for auto-upload task feature...\n');

  // Get test user
  let userId = process.env.TEST_USER_ID;
  if (!userId) {
    const { data: users } = await supabase.auth.admin.listUsers();
    userId = users?.users?.[0]?.id;
    if (!userId) {
      console.error('❌ No users found. Create a user first.');
      process.exit(1);
    }
  }
  console.log(`📧 Using user: ${userId}`);

  // Test ASINs
  const sourceAsin = 'B0TEST12345'; // The product ASIN
  const correlatedAsin = 'B0CORR67890'; // The correlated ASIN for influencer tasks

  // 1. Check/create CRM owner with title_prefix
  let ownerId;
  const { data: existingOwner } = await supabase
    .from('crm_owners')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .single();

  if (existingOwner) {
    ownerId = existingOwner.id;
    console.log(`✅ Using existing owner: ${ownerId}`);
  } else {
    const { data: newOwner, error: ownerError } = await supabase
      .from('crm_owners')
      .insert({
        user_id: userId,
        name: 'Test Influencer',
        title_prefix: 'Amazing Review'
      })
      .select()
      .single();

    if (ownerError) {
      console.error('❌ Failed to create owner:', ownerError.message);
      process.exit(1);
    }
    ownerId = newOwner.id;
    console.log(`✅ Created owner with title_prefix "Amazing Review": ${ownerId}`);
  }

  // 2. Create/update test product
  const { data: product, error: productError } = await supabase
    .from('sourced_products')
    .upsert({
      user_id: userId,
      asin: sourceAsin,
      title: 'Wireless Bluetooth Headphones',
      owner_id: ownerId,
      video_title: null // Will be auto-generated when video is uploaded
    }, {
      onConflict: 'user_id,asin'
    })
    .select()
    .single();

  if (productError) {
    console.error('❌ Failed to create product:', productError.message);
    process.exit(1);
  }
  console.log(`✅ Created product "${product.title}" (ASIN: ${sourceAsin})`);
  console.log(`   Product ID: ${product.id}`);

  // 3. Create accepted ASIN correlation
  const { error: corrError } = await supabase
    .from('asin_correlations')
    .upsert({
      user_id: userId,
      search_asin: sourceAsin,
      similar_asin: correlatedAsin,
      correlated_title: 'Premium Wireless Headphones - Noise Cancelling',
      decision: 'accepted',
      decision_at: new Date().toISOString(),
      available_us: true,
      available_ca: true,
      available_uk: false,
      available_de: true
    }, {
      onConflict: 'user_id,search_asin,similar_asin'
    });

  if (corrError) {
    console.error('❌ Failed to create correlation:', corrError.message);
    process.exit(1);
  }
  console.log(`✅ Created accepted ASIN correlation:`);
  console.log(`   Source: ${sourceAsin} → Correlated: ${correlatedAsin}`);
  console.log(`   Available: US ✓, CA ✓, DE ✓, UK ✗`);

  // 4. Clean up any existing test influencer tasks
  const { error: cleanupError } = await supabase
    .from('influencer_tasks')
    .delete()
    .eq('user_id', userId)
    .eq('asin', correlatedAsin);

  if (!cleanupError) {
    console.log(`🧹 Cleaned up any existing test influencer tasks`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 Test Data Ready!');
  console.log('='.repeat(60));
  console.log(`
To verify the feature:

1. Upload a video to product ID: ${product.id}
   (ASIN: ${sourceAsin})

2. After upload, verify:
   
   a) video_title was auto-generated:
      Expected: "Amazing Review Wireless Bluetooth Headphones"
      
   b) Influencer tasks were created for correlated ASIN:
      - ASIN: ${correlatedAsin}
      - Marketplaces: US, CA, DE (3 tasks)
      
3. Check database:
   
   SELECT video_title FROM sourced_products WHERE id = '${product.id}';
   
   SELECT marketplace, status, video_id 
   FROM influencer_tasks 
   WHERE asin = '${correlatedAsin}' AND user_id = '${userId}';
`);
}

seed().catch(console.error);
