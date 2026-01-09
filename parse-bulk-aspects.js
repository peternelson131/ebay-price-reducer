const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  console.log('📖 Reading bulk aspects file...');
  const data = JSON.parse(fs.readFileSync('ebay-aspects-bulk.json', 'utf8'));
  
  console.log(`📊 Found ${data.categoryAspects.length} categories\n`);
  
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Process and filter to only categories with required aspects
  let stored = 0, skipped = 0;
  const batch = [];
  const BATCH_SIZE = 500;
  
  for (const cat of data.categoryAspects) {
    const requiredAspects = (cat.aspects || [])
      .filter(a => a.aspectConstraint?.aspectRequired === true)
      .map(a => a.localizedAspectName);
    
    if (requiredAspects.length > 0) {
      batch.push({
        category_id: cat.category.categoryId,
        category_name: cat.category.categoryName,
        required_aspects: requiredAspects,
        fetched_at: new Date().toISOString()
      });
      stored++;
      
      if (batch.length >= BATCH_SIZE) {
        await supabase.from('ebay_category_aspects').upsert(batch, { onConflict: 'category_id' });
        console.log(`📥 Stored ${stored} categories...`);
        batch.length = 0;
      }
    } else {
      skipped++;
    }
  }
  
  // Final batch
  if (batch.length > 0) {
    await supabase.from('ebay_category_aspects').upsert(batch, { onConflict: 'category_id' });
  }
  
  console.log(`\n✅ Done!`);
  console.log(`   Stored: ${stored} categories (with required aspects)`);
  console.log(`   Skipped: ${skipped} categories (no required aspects)`);
}

run().catch(console.error);
