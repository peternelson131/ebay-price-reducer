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
    .select('ebay_client_id, ebay_client_secret')
    .eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8')
    .single();

  if (user.ebay_client_id) {
    const clientId = decrypt(user.ebay_client_id);
    console.log('Client ID:', clientId.substring(0, 20) + '...');
  }
  if (user.ebay_client_secret) {
    const clientSecret = decrypt(user.ebay_client_secret);
    console.log('Client Secret:', clientSecret.substring(0, 10) + '...');
  }
}

check().catch(console.error);
