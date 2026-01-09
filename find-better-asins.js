const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

// More popular ASINs with better data
const ASINS = [
  'B0C8PSMPTH',  // Nintendo Switch Mario Kart
  'B0BN5CSPZY',  // PS5 Hogwarts Legacy
  'B09WN1QH8T',  // DVD
  'B00005JNOG',  // DVD - Shawshank
  'B0C9J4X4VF',  // Book - Fourth Wing
  'B0D1P8HLS4',  // Sports
  'B084ZQP8YT',  // Home - TP-Link
  'B07VGRJDFY',  // Echo Show 5
];

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  console.log('Checking ASINs for category testing:\n');
  
  for (const asin of ASINS) {
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`);
    const data = await resp.json();
    const p = data.products?.[0];
    
    if (!p) { console.log(`${asin}: Not found\n`); continue; }
    
    const hasImages = !!(p.imagesCSV || (p.images && p.images.length > 0));
    const icon = hasImages ? '✅' : '❌';
    
    console.log(`${icon} ${asin}: ${p.title?.substring(0, 50) || 'No title'}...`);
    console.log(`   productGroup: ${p.productGroup || 'null'}`);
    console.log(`   type: ${p.type || 'null'}`);
    console.log('');
  }
}
run().catch(console.error);
