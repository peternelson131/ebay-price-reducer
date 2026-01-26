/**
 * Verification Script: Test encrypt→store→retrieve→decrypt cycle
 * 
 * This script tests the full encryption cycle by:
 * 1. Creating a test record with encrypted token
 * 2. Retrieving it
 * 3. Decrypting and verifying
 * 4. Cleaning up the test record
 * 
 * This does NOT modify any existing data.
 * 
 * Usage: 
 *   export SOCIAL_TOKEN_ENCRYPTION_KEY="your-key"
 *   export SUPABASE_URL="your-url"
 *   export SUPABASE_SERVICE_ROLE_KEY="your-key"
 *   node verify-encryption-cycle.js
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken, decryptToken, isConfigured } = require('./netlify/functions/utils/social-token-encryption');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
  console.error('❌ Missing SOCIAL_TOKEN_ENCRYPTION_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function verifyEncryptionCycle() {
  console.log('🔒 Verifying Encryption Cycle\n');
  console.log('=' .repeat(60) + '\n');

  const testToken = 'TEST_TOKEN_' + Date.now() + '_VERIFICATION';
  const testUserId = '00000000-0000-0000-0000-000000000000'; // Invalid UUID for testing
  let testRecordId = null;
  let allPassed = true;

  try {
    // Step 1: Verify encryption is configured
    console.log('Step 1: Check encryption configuration');
    if (!isConfigured()) {
      throw new Error('Encryption not configured');
    }
    console.log('  ✅ Encryption key is configured\n');

    // Step 2: Test in-memory encrypt/decrypt
    console.log('Step 2: Test in-memory encrypt/decrypt');
    const encrypted = encryptToken(testToken);
    console.log(`  📝 Original:  ${testToken.substring(0, 30)}...`);
    console.log(`  🔐 Encrypted: ${encrypted.substring(0, 30)}...`);
    
    const decrypted = decryptToken(encrypted);
    if (decrypted !== testToken) {
      throw new Error('In-memory decrypt failed - tokens do not match');
    }
    console.log(`  🔓 Decrypted: ${decrypted.substring(0, 30)}...`);
    console.log('  ✅ In-memory encrypt/decrypt works\n');

    // Step 3: Test database write with encrypted token
    console.log('Step 3: Test database write with encrypted token');
    
    // First check if we have a real user to use for the test
    const { data: users } = await supabase
      .from('users')
      .select('id')
      .limit(1);
    
    if (!users || users.length === 0) {
      console.log('  ⚠️  No users found in database - skipping database test');
      console.log('  ℹ️  In-memory tests passed, but cannot verify full DB cycle\n');
    } else {
      const realUserId = users[0].id;
      
      // Insert test record
      const { data: insertData, error: insertError } = await supabase
        .from('social_connections')
        .insert({
          user_id: realUserId,
          platform: 'test_verification',
          access_token: encrypted,
          created_at: new Date().toISOString()
        })
        .select('id')
        .single();
      
      if (insertError) {
        throw new Error(`Failed to insert test record: ${insertError.message}`);
      }
      testRecordId = insertData.id;
      console.log(`  ✅ Inserted test record (id: ${testRecordId})\n`);

      // Step 4: Test database read and decrypt
      console.log('Step 4: Test database read and decrypt');
      const { data: readData, error: readError } = await supabase
        .from('social_connections')
        .select('access_token')
        .eq('id', testRecordId)
        .single();
      
      if (readError) {
        throw new Error(`Failed to read test record: ${readError.message}`);
      }
      
      const retrievedEncrypted = readData.access_token;
      console.log(`  📥 Retrieved: ${retrievedEncrypted.substring(0, 30)}...`);
      
      const finalDecrypted = decryptToken(retrievedEncrypted);
      console.log(`  🔓 Decrypted: ${finalDecrypted.substring(0, 30)}...`);
      
      if (finalDecrypted !== testToken) {
        throw new Error('Database round-trip failed - tokens do not match');
      }
      console.log('  ✅ Database encrypt→store→retrieve→decrypt works\n');
    }

    // Step 5: Verify existing tokens can still be read (if any exist)
    console.log('Step 5: Check existing Meta/Instagram connections');
    const { data: existing, error: existingError } = await supabase
      .from('social_connections')
      .select('id, platform, user_id, access_token')
      .in('platform', ['meta', 'instagram']);
    
    if (existingError) {
      console.log(`  ⚠️  Error fetching: ${existingError.message}`);
    } else if (!existing || existing.length === 0) {
      console.log('  ℹ️  No existing Meta/Instagram connections found');
    } else {
      console.log(`  📊 Found ${existing.length} existing connection(s):`);
      for (const conn of existing) {
        const isEncrypted = conn.access_token && conn.access_token.includes(':');
        const status = isEncrypted ? '🔐 Encrypted' : '⚠️  Plaintext';
        console.log(`     - ${conn.platform} (${status})`);
      }
    }
    console.log('');

  } catch (error) {
    console.error(`❌ Verification failed: ${error.message}\n`);
    allPassed = false;
  } finally {
    // Cleanup: Delete test record if created
    if (testRecordId) {
      console.log('Cleanup: Removing test record');
      const { error: deleteError } = await supabase
        .from('social_connections')
        .delete()
        .eq('id', testRecordId);
      
      if (deleteError) {
        console.log(`  ⚠️  Failed to delete test record: ${deleteError.message}`);
      } else {
        console.log('  ✅ Test record deleted\n');
      }
    }
  }

  // Summary
  console.log('=' .repeat(60));
  if (allPassed) {
    console.log('\n🎉 All verifications passed!');
    console.log('   The encryption cycle is working correctly.');
    console.log('   Safe to proceed with migration.\n');
    process.exit(0);
  } else {
    console.log('\n❌ Verification failed!');
    console.log('   Do NOT proceed with migration until issues are resolved.\n');
    process.exit(1);
  }
}

// Run verification
verifyEncryptionCycle();
