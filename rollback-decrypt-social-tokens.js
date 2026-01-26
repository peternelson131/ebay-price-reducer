/**
 * ROLLBACK Script: Decrypt social tokens back to plaintext
 * 
 * ⚠️  EMERGENCY USE ONLY - Returns tokens to insecure plaintext state
 * 
 * This script decrypts encrypted tokens back to plaintext if encryption
 * causes issues and you need to rollback.
 * 
 * Usage: 
 *   export SOCIAL_TOKEN_ENCRYPTION_KEY="your-key"
 *   export SUPABASE_URL="your-url"
 *   export SUPABASE_SERVICE_ROLE_KEY="your-key"
 *   node rollback-decrypt-social-tokens.js
 */

const { createClient } = require('@supabase/supabase-js');
const { decryptToken } = require('./netlify/functions/utils/social-token-encryption');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!process.env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
  console.error('❌ Missing SOCIAL_TOKEN_ENCRYPTION_KEY environment variable');
  console.error('   You need the SAME key that was used to encrypt the tokens!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function rollbackTokens() {
  console.log('⚠️  ROLLBACK: Decrypting social tokens back to plaintext\n');
  console.log('   This returns tokens to an INSECURE state.\n');

  try {
    // Fetch all Meta and Instagram connections
    const { data: connections, error: fetchError } = await supabase
      .from('social_connections')
      .select('id, user_id, platform, access_token')
      .in('platform', ['meta', 'instagram']);

    if (fetchError) {
      throw new Error(`Failed to fetch connections: ${fetchError.message}`);
    }

    if (!connections || connections.length === 0) {
      console.log('✅ No Meta/Instagram connections found. Nothing to rollback.');
      return;
    }

    console.log(`📊 Found ${connections.length} connections to process:\n`);

    let decrypted = 0;
    let skipped = 0;
    let failed = 0;

    for (const conn of connections) {
      const { id, user_id, platform, access_token } = conn;

      // Check if token is encrypted (contains colons from iv:authTag:encrypted format)
      if (!access_token || !access_token.includes(':')) {
        console.log(`⏭️  Skipping ${platform} for user ${user_id} (already plaintext)`);
        skipped++;
        continue;
      }

      try {
        // Decrypt the token
        const plaintextToken = decryptToken(access_token);

        // Update in database with plaintext
        const { error: updateError } = await supabase
          .from('social_connections')
          .update({ 
            access_token: plaintextToken,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) {
          throw updateError;
        }

        console.log(`✅ Decrypted ${platform} token for user ${user_id}`);
        decrypted++;

      } catch (error) {
        console.error(`❌ Failed to decrypt ${platform} token for user ${user_id}:`, error.message);
        failed++;
      }
    }

    console.log('\n📈 Rollback Summary:');
    console.log(`   ✅ Decrypted: ${decrypted}`);
    console.log(`   ⏭️  Skipped (already plaintext): ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Total processed: ${connections.length}`);

    if (failed > 0) {
      console.log('\n⚠️  Some tokens failed to decrypt.');
      console.log('   Possible causes:');
      console.log('   - Wrong encryption key');
      console.log('   - Corrupted token data');
      console.log('   - Token was never encrypted');
      process.exit(1);
    } else {
      console.log('\n⚠️  Rollback complete. Tokens are now in PLAINTEXT.');
      console.log('   Re-encrypt as soon as possible!');
    }

  } catch (error) {
    console.error('\n❌ Rollback failed:', error);
    process.exit(1);
  }
}

// Require confirmation
const args = process.argv.slice(2);
if (!args.includes('--confirm')) {
  console.log('⚠️  This will decrypt all Meta/Instagram tokens to PLAINTEXT.');
  console.log('');
  console.log('   This is a security downgrade and should only be used');
  console.log('   if encryption is causing problems.');
  console.log('');
  console.log('   To proceed, run:');
  console.log('   node rollback-decrypt-social-tokens.js --confirm');
  console.log('');
  process.exit(0);
}

// Run rollback
rollbackTokens();
