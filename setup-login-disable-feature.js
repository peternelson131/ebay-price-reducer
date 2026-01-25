#!/usr/bin/env node
/**
 * Setup Login Disable Feature
 * 
 * This script creates the system_state table (if it doesn't exist)
 * and initializes the logins_disabled setting.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupLoginDisableFeature() {
  console.log('🚀 Setting up Login Disable feature...\n');

  // Step 1: Check if system_state table exists by trying to query it
  console.log('1. Checking for system_state table...');
  const { data: tableCheck, error: tableError } = await supabase
    .from('system_state')
    .select('key')
    .limit(1);

  if (tableError && tableError.code === 'PGRST204') {
    console.log('❌ system_state table does NOT exist.');
    console.log('\n📋 Please run this SQL in the Supabase SQL Editor:\n');
    console.log('----------------------------------------');
    console.log(`
-- Create system_state table
CREATE TABLE IF NOT EXISTS system_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_state_updated_at ON system_state(updated_at);

-- Enable RLS
ALTER TABLE system_state ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage
CREATE POLICY "Service role can manage system state"
ON system_state
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE system_state IS 'Stores system-wide state information';

-- Insert logins_disabled setting
INSERT INTO system_state (key, value, updated_at)
VALUES ('logins_disabled', 'false', NOW())
ON CONFLICT (key) DO NOTHING;

SELECT * FROM system_state WHERE key = 'logins_disabled';
    `);
    console.log('----------------------------------------\n');
    console.log('After running the SQL, run this script again to verify.');
    process.exit(1);
  } else if (tableError) {
    console.error('❌ Error checking table:', tableError);
    process.exit(1);
  }

  console.log('✅ system_state table exists');

  // Step 2: Check if logins_disabled setting exists
  console.log('\n2. Checking for logins_disabled setting...');
  const { data: setting, error: settingError } = await supabase
    .from('system_state')
    .select('*')
    .eq('key', 'logins_disabled')
    .single();

  if (settingError && settingError.code === 'PGRST116') {
    // Setting doesn't exist, create it
    console.log('⚙️  Creating logins_disabled setting...');
    const { data: newSetting, error: insertError } = await supabase
      .from('system_state')
      .insert({
        key: 'logins_disabled',
        value: 'false',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ Failed to create setting:', insertError);
      process.exit(1);
    }

    console.log('✅ Created logins_disabled setting:', newSetting);
  } else if (settingError) {
    console.error('❌ Error checking setting:', settingError);
    process.exit(1);
  } else {
    console.log('✅ logins_disabled setting already exists:', setting);
  }

  console.log('\n🎉 Login Disable feature is ready!');
  console.log('\n📝 Summary:');
  console.log('   - system_state table: ✅ Exists');
  console.log('   - logins_disabled setting: ✅ Configured');
  console.log(`   - Current value: ${setting?.value || 'false'} (logins ${setting?.value === 'true' ? 'DISABLED' : 'ENABLED'})`);
  console.log('\n👉 Next steps:');
  console.log('   1. Deploy the updated functions to Netlify');
  console.log('   2. Test as admin user in the Account page > Admin tab');
  console.log('   3. Toggle logins and test with a regular user account');
}

setupLoginDisableFeature().catch(error => {
  console.error('❌ Setup failed:', error);
  process.exit(1);
});
