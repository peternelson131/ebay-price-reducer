/**
 * Fix Keepa Key Encryption
 * 
 * Re-encrypts Pete's Keepa API key that was stored in plain text
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM, 
    Buffer.from(ENCRYPTION_KEY, 'hex'), 
    iv
  );
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

async function fix() {
  console.log('🔧 Fixing Keepa key encryption\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Get Pete's Keepa key
  const { data, error } = await supabase
    .from('user_api_keys')
    .select('*')
    .eq('user_id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8')
    .eq('service', 'keepa')
    .single();

  if (error || !data) {
    console.error('❌ Could not find Keepa key:', error);
    return;
  }

  const plainKey = data.api_key_encrypted;
  console.log(`📝 Current key format: ${plainKey.substring(0, 20)}...`);
  console.log(`📝 Has colon (already encrypted): ${plainKey.includes(':')}`);

  if (plainKey.includes(':')) {
    console.log('✅ Key is already encrypted. Nothing to do.');
    return;
  }

  // Encrypt the key
  const encryptedKey = encrypt(plainKey);
  console.log(`🔐 Encrypted format: ${encryptedKey.substring(0, 40)}...`);

  // Update the database
  const { error: updateError } = await supabase
    .from('user_api_keys')
    .update({ api_key_encrypted: encryptedKey })
    .eq('id', data.id);

  if (updateError) {
    console.error('❌ Failed to update:', updateError);
    return;
  }

  console.log('\n✅ Keepa key encrypted and updated successfully!');
}

fix().catch(console.error);
