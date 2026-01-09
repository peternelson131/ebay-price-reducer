const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Initial keyword patterns (case-insensitive regex patterns)
  const keywords = [
    // Connectivity
    { aspect_name: 'Connectivity', keyword_pattern: 'wireless|bluetooth|bt\\b', aspect_value: 'Wireless' },
    { aspect_name: 'Connectivity', keyword_pattern: 'wired|3\\.5mm|aux|cable', aspect_value: 'Wired' },
    { aspect_name: 'Connectivity', keyword_pattern: 'usb-c|usb c', aspect_value: 'USB-C' },
    
    // Type (Headphones)
    { aspect_name: 'Type', keyword_pattern: 'over-ear|over ear|around ear', aspect_value: 'Ear-Cup (Over the Ear)' },
    { aspect_name: 'Type', keyword_pattern: 'on-ear|on ear', aspect_value: 'Ear-Pad (On the Ear)' },
    { aspect_name: 'Type', keyword_pattern: 'earbud|in-ear|in ear|earphone', aspect_value: 'Earbud (In Ear)' },
    { aspect_name: 'Type', keyword_pattern: 'true wireless|tws', aspect_value: 'Earbud (In Ear)' },
    
    // Platform (Video Games)
    { aspect_name: 'Platform', keyword_pattern: 'ps5|playstation 5', aspect_value: 'Sony PlayStation 5' },
    { aspect_name: 'Platform', keyword_pattern: 'ps4|playstation 4', aspect_value: 'Sony PlayStation 4' },
    { aspect_name: 'Platform', keyword_pattern: 'xbox series|series x|series s', aspect_value: 'Microsoft Xbox Series X|S' },
    { aspect_name: 'Platform', keyword_pattern: 'xbox one', aspect_value: 'Microsoft Xbox One' },
    { aspect_name: 'Platform', keyword_pattern: 'nintendo switch|switch', aspect_value: 'Nintendo Switch' },
    { aspect_name: 'Platform', keyword_pattern: '\\bpc\\b|windows|steam', aspect_value: 'PC' },
    
    // Color (common)
    { aspect_name: 'Color', keyword_pattern: '\\bblack\\b', aspect_value: 'Black' },
    { aspect_name: 'Color', keyword_pattern: '\\bwhite\\b', aspect_value: 'White' },
    { aspect_name: 'Color', keyword_pattern: '\\bsilver\\b', aspect_value: 'Silver' },
    { aspect_name: 'Color', keyword_pattern: '\\bgold\\b', aspect_value: 'Gold' },
    { aspect_name: 'Color', keyword_pattern: '\\bred\\b', aspect_value: 'Red' },
    { aspect_name: 'Color', keyword_pattern: '\\bblue\\b|navy', aspect_value: 'Blue' },
    { aspect_name: 'Color', keyword_pattern: '\\bpink\\b|rose', aspect_value: 'Pink' },
    { aspect_name: 'Color', keyword_pattern: '\\bgreen\\b', aspect_value: 'Green' },
    
    // Type (general electronics)
    { aspect_name: 'Type', keyword_pattern: 'portable|travel', aspect_value: 'Portable' },
    { aspect_name: 'Type', keyword_pattern: 'desktop|tabletop', aspect_value: 'Desktop' },
  ];

  console.log('📝 Seeding keyword patterns...\n');

  for (const kw of keywords) {
    const { error } = await supabase
      .from('ebay_aspect_keywords')
      .upsert(kw, { onConflict: 'aspect_name,keyword_pattern' })
      .select();
    
    if (error && !error.message.includes('duplicate')) {
      console.log(`❌ ${kw.aspect_name}: ${error.message}`);
    } else {
      console.log(`✅ ${kw.aspect_name}: "${kw.keyword_pattern}" → ${kw.aspect_value}`);
    }
  }

  console.log(`\n✅ Seeded ${keywords.length} keyword patterns`);
}

run().catch(console.error);
