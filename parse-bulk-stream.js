const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const { chain } = require('stream-chain');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  console.log('📖 Streaming bulk aspects file...\n');
  
  let stored = 0, skipped = 0, total = 0;
  let batch = [];
  const BATCH_SIZE = 500;

  // We need to extract categoryAspects array from the JSON
  // First, let's use a simpler approach - split the file
  const { spawn } = require('child_process');
  
  // Use jq to extract just what we need
  console.log('Extracting categoryAspects with jq...');
  
  const jq = spawn('jq', ['-c', '.categoryAspects[]', 'ebay-aspects-bulk.json']);
  
  const readline = require('readline');
  const rl = readline.createInterface({ input: jq.stdout });
  
  for await (const line of rl) {
    const cat = JSON.parse(line);
    total++;
    
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
        console.log(`📥 Stored ${stored}/${total}...`);
        batch = [];
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
  console.log(`   Total categories: ${total}`);
  console.log(`   Stored: ${stored} (with required aspects)`);
  console.log(`   Skipped: ${skipped} (no required aspects)`);
}

run().catch(console.error);
