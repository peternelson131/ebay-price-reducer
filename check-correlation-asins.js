const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  // Get ASINs from correlations
  const { data: correlations } = await supabase.from('asin_correlations').select('search_asin').limit(100);
  const asins = [...new Set(correlations.map(c => c.search_asin))];
  
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  console.log('🔍 Checking Pete\'s actual ASINs from correlations\n');
  
  const byCategory = {};
  
  for (const asin of asins.slice(0, 20)) {
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`);
    const data = await resp.json();
    const p = data.products?.[0];
    
    if (!p || !p.title) continue;
    
    const hasImages = !!(p.imagesCSV || (p.images && p.images.length > 0));
    const group = p.productGroup || 'Unknown';
    
    if (!byCategory[group]) byCategory[group] = [];
    byCategory[group].push({
      asin,
      type: p.type,
      title: p.title?.substring(0, 40),
      hasImages
    });
  }
  
  console.log('Categories found in Pete\'s data:\n');
  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`📁 ${cat} (${items.length} items)`);
    items.forEach(i => console.log(`   ${i.hasImages ? '✅' : '❌'} ${i.asin}: ${i.type || 'null'} - ${i.title}`));
    console.log('');
  }
}
run().catch(console.error);
