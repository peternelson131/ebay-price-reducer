const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

// ASINs that failed with "no images"
const ASINS = ['B08CRSM9FR', 'B07PDHSJ3N', 'B07BKLMWRP', 'B00U2UYWA0'];

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  console.log('🔍 Debugging Keepa image data\n');

  for (const asin of ASINS) {
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`);
    const data = await resp.json();
    const p = data.products?.[0];
    
    if (!p) { console.log(`${asin}: NOT FOUND\n`); continue; }
    
    console.log(`${asin}: ${p.title?.substring(0, 50)}`);
    console.log(`  imagesCSV: ${p.imagesCSV ? p.imagesCSV.substring(0, 80) + '...' : 'NULL'}`);
    console.log(`  images array: ${p.images ? JSON.stringify(p.images).substring(0, 80) + '...' : 'NULL'}`);
    
    // Check all image-related fields
    const imageFields = Object.keys(p).filter(k => k.toLowerCase().includes('image'));
    console.log(`  Image fields found: ${imageFields.join(', ') || 'none'}`);
    console.log('');
  }
}
run().catch(console.error);
