const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAndAddStatus() {
  console.log('🔍 Checking current statuses in database...\n');
  
  // Get all statuses
  const { data: statuses, error: fetchError } = await supabase
    .from('crm_statuses')
    .select('*')
    .order('sort_order');
  
  if (fetchError) {
    console.error('❌ Error fetching statuses:', fetchError);
    return;
  }
  
  console.log('Current statuses:');
  statuses.forEach(s => {
    console.log(`  - ${s.name} (color: ${s.color}, sort: ${s.sort_order}, user_id: ${s.user_id || 'SYSTEM'})`);
  });
  
  // Check if "video made" already exists as a SYSTEM status (exact match, case-sensitive)
  const systemVideoMade = statuses.find(s => s.name === 'video made' && s.user_id === null);
  
  if (systemVideoMade) {
    console.log('\n✅ "video made" system status already exists!');
    console.log('Status details:', systemVideoMade);
    return;
  }
  
  // Check if there's a user-specific "Video Made" (different case)
  const userVideoMade = statuses.filter(s => s.name.toLowerCase() === 'video made');
  if (userVideoMade.length > 0) {
    console.log('\n⚠️  Found user-specific "Video Made" statuses (case mismatch):');
    userVideoMade.forEach(s => console.log(`   - "${s.name}" for user ${s.user_id}`));
    console.log('\n📝 Adding system-level "video made" status (lowercase) for consistency...');
  }
  
  console.log('\n📝 Adding "video made" status...');
  
  // Find the highest sort_order for system statuses
  const systemStatuses = statuses.filter(s => s.user_id === null);
  const maxSortOrder = Math.max(...systemStatuses.map(s => s.sort_order || 0));
  
  // Insert the new status
  const { data: newStatus, error: insertError } = await supabase
    .from('crm_statuses')
    .insert({
      user_id: null,  // System default
      name: 'video made',
      color: '#F97316',  // Orange/amber color
      sort_order: maxSortOrder + 1,
      auto_set_on_delivery: false
    })
    .select()
    .single();
  
  if (insertError) {
    console.error('❌ Error adding status:', insertError);
    return;
  }
  
  console.log('\n✅ Successfully added "video made" status!');
  console.log('Status details:', newStatus);
  
  // Verify it's visible
  console.log('\n🔍 Verifying status was added...');
  const { data: verifyStatuses, error: verifyError } = await supabase
    .from('crm_statuses')
    .select('*')
    .order('sort_order');
  
  if (!verifyError) {
    const videoMade = verifyStatuses.find(s => s.name.toLowerCase() === 'video made');
    if (videoMade) {
      console.log('✅ Verified: "video made" status is now in the database');
      console.log('   ID:', videoMade.id);
      console.log('   Color:', videoMade.color);
      console.log('   Sort Order:', videoMade.sort_order);
    }
  }
}

checkAndAddStatus()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
