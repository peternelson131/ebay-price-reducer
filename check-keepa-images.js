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
  
  console.log(`ASIN: ${asin}`);
  console.log(`Title: ${p?.title?.substring(0, 50)}...`);
  console.log(`Images: ${p?.imagesCSV || 'NONE'}`);
}

// Check a few video game ASINs
const asins = ['B0C8PMPK66', 'B0BXGHYP6B', 'B09HHLX5HP'];
(async () => {
  for (const asin of asins) {
    await check(asin);
    console.log('');
  }
})();
