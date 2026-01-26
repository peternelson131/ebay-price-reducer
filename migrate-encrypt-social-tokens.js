/**
 * Migration Script: Encrypt existing Meta/Instagram tokens
 * 
 * This script re-encrypts existing plaintext tokens in the social_connections table.
 * Run once after deploying the encryption fixes.
 * 
 * Usage: node migrate-encrypt-social-tokens.js
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken } = require('./netlify/functions/utils/social-token-encryption');

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

async function migrateTokens() {
  console.log('🔒 Starting token encryption migration...\n');

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
      console.log('✅ No Meta/Instagram connections found. Nothing to migrate.');
      return;
    }

    console.log(`📊 Found ${connections.length} connections to process:\n`);

    let encrypted = 0;
    let skipped = 0;
    let failed = 0;

    for (const conn of connections) {
      const { id, user_id, platform, access_token } = conn;

      // Check if token is already encrypted (contains colons from iv:authTag:encrypted format)
      if (access_token && access_token.includes(':')) {
        console.log(`⏭️  Skipping ${platform} for user ${user_id} (already encrypted)`);
        skipped++;
        continue;
      }

      try {
        // Encrypt the plaintext token
        const encryptedToken = encryptToken(access_token);

        // Update in database
        const { error: updateError } = await supabase
          .from('social_connections')
          .update({ 
            access_token: encryptedToken,
            updated_at: new Date().toISOString()
          })
          .eq('id', id);

        if (updateError) {
          throw updateError;
        }

        console.log(`✅ Encrypted ${platform} token for user ${user_id}`);
        encrypted++;

      } catch (error) {
        console.error(`❌ Failed to encrypt ${platform} token for user ${user_id}:`, error.message);
        failed++;
      }
    }

    console.log('\n📈 Migration Summary:');
    console.log(`   ✅ Encrypted: ${encrypted}`);
    console.log(`   ⏭️  Skipped (already encrypted): ${skipped}`);
    console.log(`   ❌ Failed: ${failed}`);
    console.log(`   📊 Total processed: ${connections.length}`);

    if (failed > 0) {
      console.log('\n⚠️  Some tokens failed to encrypt. Review errors above.');
      process.exit(1);
    } else {
      console.log('\n✅ Migration complete! All tokens are now encrypted.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateTokens();
