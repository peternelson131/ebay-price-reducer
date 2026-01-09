const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Create tables using raw SQL via RPC
  const sql = `
    -- Table 1: Keyword patterns for aspect values
    CREATE TABLE IF NOT EXISTS ebay_aspect_keywords (
      id SERIAL PRIMARY KEY,
      aspect_name TEXT NOT NULL,
      keyword_pattern TEXT NOT NULL,
      aspect_value TEXT NOT NULL,
      category_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(aspect_name, keyword_pattern, COALESCE(category_id, ''))
    );

    -- Table 2: Log missing aspects for review
    CREATE TABLE IF NOT EXISTS ebay_aspect_misses (
      id SERIAL PRIMARY KEY,
      asin TEXT NOT NULL,
      category_id TEXT,
      category_name TEXT,
      aspect_name TEXT NOT NULL,
      product_title TEXT NOT NULL,
      keepa_brand TEXT,
      keepa_model TEXT,
      status TEXT DEFAULT 'pending',
      reviewed_at TIMESTAMPTZ,
      suggested_value TEXT,
      suggested_pattern TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_aspect_misses_status ON ebay_aspect_misses(status);
    CREATE INDEX IF NOT EXISTS idx_aspect_misses_asin ON ebay_aspect_misses(asin);
    CREATE INDEX IF NOT EXISTS idx_aspect_keywords_aspect ON ebay_aspect_keywords(aspect_name);
  `;

  // Execute via pg
  const { data, error } = await supabase.rpc('exec_sql', { sql });
  
  if (error) {
    console.log('RPC not available, creating via REST...');
    
    // Try inserting a test row to verify tables exist or create manually
    const { error: e1 } = await supabase.from('ebay_aspect_keywords').select('id').limit(1);
    const { error: e2 } = await supabase.from('ebay_aspect_misses').select('id').limit(1);
    
    if (e1?.code === '42P01' || e2?.code === '42P01') {
      console.log('Tables do not exist - need to create via Supabase dashboard or migration');
      console.log('\nSQL to run:');
      console.log(sql);
    } else {
      console.log('Tables may already exist');
    }
  } else {
    console.log('✅ Tables created');
  }
}

run().catch(console.error);
