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
    console.log(`✅ ${asin}: ${p.title.substring(0, 50)}... (has images)`);
    return asin;
  } else {
    console.log(`❌ ${asin}: ${p?.title?.substring(0,30) || 'not found'}...`);
    return null;
  }
}

// Older, well-indexed game ASINs
const asins = [
  'B07SFKTLZC', // Zelda Link's Awakening
  'B07SN3MK6R', // Super Mario Maker 2
  'B07NCWXXRP', // Spider-Man PS4
  'B07DJWBYKP', // Red Dead Redemption 2
  'B01GW8XOY2', // Overwatch
  'B00ZIW1SRE', // Dark Souls 3
];

(async () => {
  console.log('Looking for video games with images...\n');
  for (const asin of asins) {
    const found = await check(asin);
    if (found) console.log(`   → Use this one!\n`);
  }
})();
