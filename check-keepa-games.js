const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function check(asin) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('service', 'keepa').limit(1).single();
  const key = decrypt(keyData.api_key_encrypted);
  
  const resp = await fetch(`https://api.keepa.com/product?key=${key}&domain=1&asin=${asin}&stats=180`);
  const data = await resp.json();
  const p = data.products?.[0];
  
  if (p?.title && p?.imagesCSV) {
    console.log(`✅ ${asin}: ${p.title.substring(0, 40)}... (has images)`);
    return true;
  } else {
    console.log(`❌ ${asin}: ${p?.title ? 'no images' : 'not found'}`);
    return false;
  }
}

// Try common video game ASINs
const asins = [
  'B08FC5L3RG', // Mario Kart 8
  'B097B2HQ5K', // Elden Ring PS5
  'B09JKF73WS', // Pokemon Violet
  'B08H93ZRK9', // Animal Crossing
  'B09DFCB66S', // Mario Party Superstars
];

(async () => {
  console.log('Looking for video games with images in Keepa...\n');
  for (const asin of asins) {
    await check(asin);
  }
})();
