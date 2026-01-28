#!/usr/bin/env node
/**
 * Run Migration Directly
 * 
 * This script applies the SQL migration directly to the database
 * using the Supabase service role key.
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function executeSQLStatements(sql) {
  // Split SQL into individual statements (naive split by semicolon)
  // This works for most cases but may fail with complex SQL
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));
  
  console.log(`\n📝 Executing ${statements.length} SQL statements...\n`);
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    
    // Skip comments
    if (statement.startsWith('--') || statement.length < 5) {
      continue;
    }
    
    try {
      // Extract a brief description for logging
      const preview = statement.substring(0, 60).replace(/\n/g, ' ') + '...';
      console.log(`[${i + 1}/${statements.length}] ${preview}`);
      
      // Execute via RPC (we'll need to create a function for this)
      const { data, error } = await supabase.rpc('exec_sql', { 
        sql_query: statement + ';' 
      });
      
      if (error) {
        // If the RPC function doesn't exist, we need to use the REST API directly
        if (error.code === 'PGRST202' || error.message.includes('exec_sql')) {
          console.log('   ⚠️  exec_sql RPC not available, using direct approach...');
          
          // Use the PostgreSQL REST API directly
          // This requires posting to the database's HTTP endpoint
          const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
            body: JSON.stringify({ sql_query: statement + ';' })
          });
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }
        } else {
          throw error;
        }
      }
      
      console.log('   ✅ Success');
      
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      
      // Some errors are acceptable (e.g., "already exists")
      if (err.message.includes('already exists') || 
          err.message.includes('does not exist') ||
          err.message.includes('relation') && err.message.includes('already exists')) {
        console.log('   ℹ️  Continuing (may already be applied)...');
      } else {
        throw err;
      }
    }
  }
}

async function runMigration() {
  console.log('═══════════════════════════════════════');
  console.log('🚀 Running System Status Migration');
  console.log('═══════════════════════════════════════');
  
  try {
    // Read the migration file
    const migrationPath = path.join(
      __dirname,
      'supabase/migrations/20260127_make_video_made_system_field.sql'
    );
    
    console.log('\n📖 Reading migration file...');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    console.log('✅ Migration file loaded');
    
    // Since we can't execute raw SQL directly, we'll need to use a workaround
    // Let's break down the migration into individual operations we can do via the client
    
    console.log('\n🔄 Applying migration steps...\n');
    
    // Step 1: Add is_system column (use ALTER TABLE via RPC if available)
    console.log('Step 1: Adding is_system column...');
    try {
      // We'll try to select is_system to see if it exists
      const { error: checkError } = await supabase
        .from('crm_statuses')
        .select('is_system')
        .limit(1);
      
      if (checkError && checkError.message.includes('does not exist')) {
        console.log('   Column does not exist, needs to be added via SQL');
        console.log('   ⚠️  Cannot add column via JavaScript client');
      } else {
        console.log('   ✅ Column already exists');
      }
    } catch (err) {
      console.log('   ⚠️  Error checking column:', err.message);
    }
    
    // Alternative approach: Use the PostgREST admin API
    console.log('\n⚠️  Direct SQL execution not available via JS client');
    console.log('\nTo apply this migration, you have two options:\n');
    console.log('Option 1: Use Supabase Dashboard');
    console.log('  1. Go to: https://supabase.com/dashboard/project/[your-project]');
    console.log('  2. Navigate to SQL Editor');
    console.log('  3. Paste and run the migration SQL\n');
    console.log('Option 2: Use Supabase CLI');
    console.log('  1. Link project: supabase link --project-ref [your-project-ref]');
    console.log('  2. Push migration: supabase db push\n');
    
    console.log('I\'ll extract and execute the safe UPDATE statements that can be done via JS...\n');
    
    // We CAN do the UPDATEs via the client
    await applyUpdatesViaClient();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

async function applyUpdatesViaClient() {
  console.log('═══════════════════════════════════════');
  console.log('🔄 Applying UPDATE statements via client');
  console.log('═══════════════════════════════════════\n');
  
  try {
    // Step: Update sort orders
    console.log('Updating sort orders...\n');
    
    const updates = [
      { name: 'Problem', sort_order: 7 },
      { name: 'Completed', sort_order: 6 },
      { name: 'Delivered', sort_order: 5 },
      { name: 'video made', sort_order: 4 },
    ];
    
    for (const update of updates) {
      console.log(`  Setting "${update.name}" sort_order = ${update.sort_order}...`);
      
      const { error } = await supabase
        .from('crm_statuses')
        .update({ sort_order: update.sort_order })
        .eq('name', update.name)
        .is('user_id', null);
      
      if (error) {
        console.log(`    ❌ Error: ${error.message}`);
      } else {
        console.log(`    ✅ Success`);
      }
    }
    
    console.log('\n✅ Sort order updates complete');
    
    // Check if is_system column exists and update if possible
    console.log('\nAttempting to set is_system = true for system statuses...');
    
    const { error: updateError } = await supabase
      .from('crm_statuses')
      .update({ is_system: true })
      .is('user_id', null);
    
    if (updateError) {
      if (updateError.message.includes('does not exist')) {
        console.log('  ⚠️  Column "is_system" does not exist yet');
        console.log('  This column must be added via SQL (see instructions above)');
      } else {
        console.log(`  ❌ Error: ${updateError.message}`);
      }
    } else {
      console.log('  ✅ All system statuses marked with is_system = true');
    }
    
  } catch (err) {
    console.error('Error applying updates:', err.message);
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Migration process complete');
    console.log('═══════════════════════════════════════\n');
    console.log('Next steps:');
    console.log('1. Apply remaining DDL changes via SQL Editor or CLI');
    console.log('2. Run: node apply-system-status-migration.js');
    console.log('   to verify all changes\n');
    process.exit(0);
  })
  .catch((err) => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  });
