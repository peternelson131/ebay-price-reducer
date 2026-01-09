const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  // Check one that worked vs one that failed
  const testAsin = 'B00FLYWNYQ';  // Instant Pot - worked
  const failAsin = 'B08CRSM9FR';  // LEGO - failed

  for (const asin of [testAsin, failAsin]) {
    console.log(`\n🔍 Testing ${asin}:`);
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=180&offers=20`);
    const data = await resp.json();
    
    if (data.error) {
      console.log(`  Error: ${JSON.stringify(data.error)}`);
      continue;
    }
    
    const p = data.products?.[0];
    if (!p) {
      console.log(`  No product found`);
      continue;
    }
    
    console.log(`  Title: ${p.title?.substring(0, 60) || 'NULL'}`);
    console.log(`  imagesCSV: ${p.imagesCSV ? 'YES (' + p.imagesCSV.split(',').length + ' images)' : 'NULL'}`);
    console.log(`  productGroup: ${p.productGroup || 'NULL'}`);
    console.log(`  asin: ${p.asin}`);
  }
}
run().catch(console.error);
