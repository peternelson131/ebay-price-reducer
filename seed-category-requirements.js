const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });

  // Category requirements learned from testing and eBay docs
  const requirements = [
    // ✅ WORKING CATEGORIES (leaf categories)
    {
      ebay_category_id: '19006',
      ebay_category_name: 'Building Toys',
      parent_category_id: '220',
      is_leaf: true,
      required_aspects: ['Brand', 'MPN'],
      optional_aspects: ['Age Level', 'LEGO Set Number', 'LEGO Theme'],
      notes: 'Tested working - LEGO Dinosaur'
    },
    {
      ebay_category_id: '171485',
      ebay_category_name: 'Tablets & eBook Readers',
      parent_category_id: '58058',
      is_leaf: true,
      required_aspects: ['Brand', 'MPN'],
      optional_aspects: ['Model', 'Storage Capacity', 'Screen Size'],
      notes: 'Tested working - iPad Air'
    },
    {
      ebay_category_id: '139971',
      ebay_category_name: 'Video Game Consoles',
      parent_category_id: '1249',
      is_leaf: true,
      required_aspects: ['Brand', 'Platform'],
      optional_aspects: ['Model', 'Color', 'Storage Capacity'],
      notes: 'Tested working - Nintendo Switch'
    },
    {
      ebay_category_id: '20625',
      ebay_category_name: 'Small Kitchen Appliances',
      parent_category_id: '20667',
      is_leaf: true,
      required_aspects: ['Brand', 'Type'],
      optional_aspects: ['Model', 'Color', 'Features'],
      notes: 'Tested working - Instant Pot'
    },
    
    // ❌ FAILED - Need leaf categories
    {
      ebay_category_id: '293',
      ebay_category_name: 'Consumer Electronics',
      is_leaf: false,
      notes: 'NOT A LEAF - Use specific subcategories like 112529 (Headphones)'
    },
    {
      ebay_category_id: '112529',
      ebay_category_name: 'Headphones',
      parent_category_id: '293',
      is_leaf: true,
      required_aspects: ['Brand', 'Connectivity', 'Type'],
      optional_aspects: ['Model', 'Color', 'Features'],
      notes: 'Use for Electronics/Headphones instead of 293'
    },
    {
      ebay_category_id: '1249',
      ebay_category_name: 'Video Games & Consoles',
      is_leaf: false,
      notes: 'NOT A LEAF - Use 139973 (Video Games) or 139971 (Consoles)'
    },
    {
      ebay_category_id: '139973',
      ebay_category_name: 'Video Games',
      parent_category_id: '1249',
      is_leaf: true,
      required_aspects: ['Platform', 'Game Name'],
      optional_aspects: ['Rating', 'Release Year'],
      notes: 'For game software'
    },
    
    // Pet Supplies
    {
      ebay_category_id: '177799',
      ebay_category_name: 'Pet Supplies',
      is_leaf: false,
      notes: 'NOT A LEAF - Use specific categories like 20743 (Dog Supplies)'
    },
    {
      ebay_category_id: '20743',
      ebay_category_name: 'Dog Supplies',
      parent_category_id: '177799',
      is_leaf: true,
      required_aspects: ['Brand', 'Type'],
      optional_aspects: ['Size'],
      notes: 'For dog-related products'
    },
    
    // Tools
    {
      ebay_category_id: '631',
      ebay_category_name: 'Hand Tools',
      parent_category_id: '3244',
      is_leaf: true,
      required_aspects: ['Brand', 'Type'],
      optional_aspects: ['Format', 'Material'],
      notes: 'Tools failed needing Format aspect'
    },
    
    // DVDs & Movies
    {
      ebay_category_id: '617',
      ebay_category_name: 'DVDs & Movies',
      is_leaf: false,
      notes: 'NOT A LEAF - Use 617 subcategories'
    },
    {
      ebay_category_id: '63861',
      ebay_category_name: 'DVDs & Blu-ray Discs',
      parent_category_id: '617',
      is_leaf: true,
      required_aspects: ['Format', 'Movie/TV Title'],
      optional_aspects: ['Rating', 'Genre'],
      notes: 'For physical media'
    },
    
    // Default fallback
    {
      ebay_category_id: '99',
      ebay_category_name: 'Everything Else',
      is_leaf: true,
      required_aspects: [],
      optional_aspects: [],
      notes: 'Fallback category - works but not ideal'
    }
  ];

  console.log('📝 Seeding category requirements...\n');

  for (const req of requirements) {
    const { error } = await supabase
      .from('ebay_category_requirements')
      .upsert(req, { onConflict: 'ebay_category_id' });
    
    if (error) {
      console.log(`❌ ${req.ebay_category_name}: ${error.message}`);
    } else {
      const status = req.is_leaf ? '✅' : '⚠️';
      console.log(`${status} ${req.ebay_category_id}: ${req.ebay_category_name}${req.is_leaf ? '' : ' (NOT LEAF)'}`);
    }
  }

  console.log('\n✅ Done! Category requirements seeded.');
}

run().catch(console.error);
