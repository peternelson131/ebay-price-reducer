const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

// More popular ASINs - bestsellers that should be in Keepa
const MORE_ASINS = [
  // Clothing - more popular items
  'B07GXHQMRD', // Hanes t-shirts
  'B01HGP0158', // Dickies pants
  'B07BBK2XQD', // Under Armour
  
  // Health/Beauty
  'B001E96OMG', // Neutrogena sunscreen
  'B003VWXZQ0', // AquaSonic toothbrush
  
  // Sports
  'B01N75ZB4R', // Fitbit
  'B07YZYNLQ6', // Gaiam yoga mat
  
  // Grocery adjacent (supplements)
  'B00CQ7ZXL4', // Nature Made vitamins
  
  // Baby 
  'B07GNXQPJC', // WubbaNub pacifier
  
  // Jewelry/Watches
  'B08B4NFQ9C', // Casio watch
  
  // Arts & Crafts
  'B00HVVJRHE', // Crayola crayons
  
  // Industrial/Scientific
  'B000BQRFSS', // 3M safety glasses
  
  // Garden
  'B00004RA7P', // Miracle-Gro
  
  // Shoes
  'B07D9GMCXC', // Skechers
  
  // Luggage
  'B00XJX34FC', // Samsonite
  
  // Musical
  'B0002GLDQE', // Fender strings
  
  // Camera
  'B0B93VH1RL', // SanDisk SD card
];

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  console.log('🔍 Finding more diverse ASINs\n');
  
  const validAsins = [];
  
  for (const asin of MORE_ASINS) {
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`);
    const data = await resp.json();
    const p = data.products?.[0];
    
    if (!p || !p.title) {
      console.log(`❌ ${asin}: NOT FOUND`);
      continue;
    }
    
    const hasImages = !!(p.imagesCSV || (p.images && p.images.length > 0));
    
    if (hasImages && p.productGroup) {
      console.log(`✅ ${asin}: ${p.productGroup} / ${p.type || 'null'} - ${p.title?.substring(0, 40)}`);
      validAsins.push({ asin, productGroup: p.productGroup, type: p.type, title: p.title?.substring(0, 50) });
    } else {
      console.log(`⚠️ ${asin}: Missing ${!hasImages ? 'images' : 'productGroup'} - ${p.title?.substring(0, 30)}`);
    }
  }
  
  console.log(`\n✅ Found ${validAsins.length} more valid ASINs`);
}
run().catch(console.error);
