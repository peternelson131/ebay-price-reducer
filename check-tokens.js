const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { 
  if (!t) return null;
  const p = t.split(':'); 
  const iv = Buffer.from(p.shift(), 'hex'); 
  const e = Buffer.from(p.join(':'), 'hex'); 
  const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv); 
  return Buffer.concat([d.update(e), d.final()]).toString('utf8'); 
}

async function check() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const { data: user } = await supabase
    .from('users')
    .select('id, email, ebay_refresh_token, ebay_access_token, ebay_token_expires_at')
    .eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8')
    .single();

  console.log('User:', user.email);
  console.log('');
  
  if (user.ebay_refresh_token) {
    const refreshToken = decrypt(user.ebay_refresh_token);
    console.log('✅ Refresh Token: EXISTS');
    console.log(`   Length: ${refreshToken.length} chars`);
    console.log(`   Preview: ${refreshToken.substring(0, 20)}...${refreshToken.substring(refreshToken.length - 10)}`);
  } else {
    console.log('❌ Refresh Token: NOT FOUND');
  }
  
  console.log('');
  
  if (user.ebay_access_token) {
    const accessToken = decrypt(user.ebay_access_token);
    console.log('✅ Access Token: EXISTS');
    console.log(`   Length: ${accessToken.length} chars`);
    console.log(`   Expires: ${user.ebay_token_expires_at}`);
  } else {
    console.log('❌ Access Token: NOT FOUND');
  }
}

check().catch(console.error);
