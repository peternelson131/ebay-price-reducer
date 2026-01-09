const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY || !encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) { return null; }
}

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  
  const keepaKey = decrypt(keyData.api_key_encrypted);
  const asin = 'B01KJEOCDW';
  
  const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180`);
  const data = await resp.json();
  const p = data.products[0];
  
  console.log('Product:', p.title);
  console.log('Brand:', p.brand);
  console.log('Model:', p.model);
  console.log('MPN:', p.partNumber);
  console.log('UPC:', p.upcList);
}

run().catch(console.error);
