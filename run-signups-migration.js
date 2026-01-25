const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('🔄 Running signups_disabled migration...')
  
  try {
    // First, create the system_state table using RPC/SQL
    console.log('📝 Creating system_state table if it doesn\'t exist...')
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS system_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_system_state_updated_at ON system_state(updated_at);
      
      ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Service role can manage system state" ON system_state;
      CREATE POLICY "Service role can manage system state"
      ON system_state
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    `
    
    // Use the REST API to execute raw SQL via rpc
    const { data: createData, error: createError } = await supabase.rpc('exec_sql', { sql: createTableSQL })
    
    // If exec_sql doesn't exist, we'll proceed assuming the table exists or will be created manually
    if (createError && !createError.message.includes('does not exist')) {
      console.log('⚠️  Note: Could not create table via RPC, will try to insert directly')
    } else {
      console.log('✅ Table creation command executed')
    }
    
    // Now insert the signups_disabled setting
    console.log('📝 Adding signups_disabled setting...')
    
    const { data, error } = await supabase
      .from('system_state')
      .upsert({
        key: 'signups_disabled',
        value: 'false',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'key'
      })
      .select()
    
    if (error) {
      console.error('❌ Migration failed:', error)
      console.log('\n⚠️  The system_state table might not exist yet.')
      console.log('   Please run this SQL in Supabase SQL Editor:')
      console.log('   File: migrations/add-signups-disabled-setting.sql')
      process.exit(1)
    }
    
    console.log('✅ Successfully added signups_disabled system setting')
    console.log('   Default value: false (signups enabled)')
    console.log('   Admins can toggle this via the admin panel')
    
    // Verify the setting exists
    const { data: verifyData, error: verifyError } = await supabase
      .from('system_state')
      .select('*')
      .eq('key', 'signups_disabled')
      .single()
    
    if (!verifyError && verifyData) {
      console.log('\n📊 Current setting:', verifyData)
    }
    
  } catch (err) {
    console.error('❌ Error running migration:', err)
    process.exit(1)
  }
}

runMigration()
