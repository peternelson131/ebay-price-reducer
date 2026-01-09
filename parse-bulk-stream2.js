const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const { parser } = require('stream-json');
const { pick } = require('stream-json/filters/Pick');
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

  return new Promise((resolve, reject) => {
    const pipeline = chain([
      fs.createReadStream('ebay-aspects-bulk.json'),
      parser(),
      pick({ filter: 'categoryAspects' }),
      streamArray()
    ]);

    pipeline.on('data', async ({ value: cat }) => {
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
          pipeline.pause();
          await supabase.from('ebay_category_aspects').upsert(batch, { onConflict: 'category_id' });
          console.log(`📥 Stored ${stored}/${total}...`);
          batch = [];
          pipeline.resume();
        }
      } else {
        skipped++;
      }
    });

    pipeline.on('end', async () => {
      if (batch.length > 0) {
        await supabase.from('ebay_category_aspects').upsert(batch, { onConflict: 'category_id' });
      }
      console.log(`\n✅ Done!`);
      console.log(`   Total: ${total}`);
      console.log(`   Stored: ${stored}`);
      console.log(`   Skipped: ${skipped}`);
      resolve();
    });

    pipeline.on('error', reject);
  });
}

run().catch(console.error);
