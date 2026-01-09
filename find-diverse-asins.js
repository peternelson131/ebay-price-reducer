const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

// ASINs from MANY different categories
const DIVERSE_ASINS = [
  // Books
  'B0BCS38SNL', // Atomic Habits
  '1982181281', // The Body Keeps the Score
  
  // Clothing/Apparel
  'B07PXLQ3K5', // Carhartt beanie
  'B0777LQLXD', // Crocs
  
  // Home & Kitchen
  'B00FLYWNYQ', // Instant Pot
  'B07D4F3Y8P', // Ninja blender
  
  // Beauty
  'B004Y9GZCO', // CeraVe moisturizer
  'B01N7T6VMZ', // Maybelline mascara
  
  // Pet Supplies
  'B000634MH8', // Kong dog toy
  'B0002AT3TC', // Furminator
  
  // Sports & Outdoors
  'B07XZST4K4', // Yoga mat
  'B074THJPX9', // Resistance bands
  
  // Office Products
  'B07CZL2NXL', // Sharpie markers
  'B00006IE8J', // Swingline stapler
  
  // Baby
  'B07D6LT8M5', // Baby carrier
  'B07GLTK5K6', // Diapers
  
  // Automotive
  'B000CITK8S', // Armor All
  'B07VR4LCH1', // Car phone mount
  
  // Tools & Home Improvement
  'B000NK8V2K', // Gorilla Glue
  'B00004YOTW', // Stanley tape measure
  
  // Musical Instruments
  'B0002F58TQ', // Snark tuner
  'B001Q9E9VS', // Guitar picks
  
  // Health & Household
  'B00TKFEBNQ', // Crest toothpaste
  'B00NVS00AC', // Advil
  
  // Collectibles/Trading Cards
  'B09LPXHWST', // Pokemon cards
];

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  const { data: keyData } = await supabase.from('user_api_keys').select('api_key_encrypted').eq('user_id', user.id).eq('service', 'keepa').single();
  const keepaKey = decrypt(keyData.api_key_encrypted);

  console.log('🔍 Finding diverse ASINs for category testing\n');
  console.log('ASIN        | Product Group        | Type                    | Has Images | Title');
  console.log('─'.repeat(120));
  
  const validAsins = [];
  
  for (const asin of DIVERSE_ASINS) {
    const resp = await fetch(`https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`);
    const data = await resp.json();
    const p = data.products?.[0];
    
    if (!p || !p.title) {
      console.log(`${asin.padEnd(12)}| NOT FOUND`);
      continue;
    }
    
    const hasImages = !!(p.imagesCSV || (p.images && p.images.length > 0));
    const group = (p.productGroup || 'null').substring(0, 20).padEnd(20);
    const type = (p.type || 'null').substring(0, 23).padEnd(23);
    const img = hasImages ? '✅' : '❌';
    
    console.log(`${asin.padEnd(12)}| ${group} | ${type} | ${img}         | ${p.title?.substring(0, 40)}`);
    
    if (hasImages && p.productGroup) {
      validAsins.push({
        asin,
        productGroup: p.productGroup,
        type: p.type,
        title: p.title?.substring(0, 50)
      });
    }
  }
  
  console.log(`\n✅ Found ${validAsins.length} valid ASINs with images and product groups`);
  
  // Output for testing
  console.log('\n📋 Valid ASINs for testing:');
  validAsins.forEach(a => console.log(`  { asin: '${a.asin}', group: '${a.productGroup}', type: '${a.type || 'null'}' },`));
}
run().catch(console.error);
