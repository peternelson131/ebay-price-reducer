#!/usr/bin/env node
/**
 * Apply social_post_jobs migration
 * Creates the table and policies for async social media posting
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkTableExists() {
  const { data, error } = await supabase
    .from('social_post_jobs')
    .select('id')
    .limit(1);
  
  if (error && error.code === '42P01') {
    // Table doesn't exist
    return false;
  }
  
  return true;
}

async function runMigration() {
  console.log('🔍 Checking if social_post_jobs table exists...');
  
  const exists = await checkTableExists();
  
  if (exists) {
    console.log('✅ Table social_post_jobs already exists!');
    console.log('   Migration already applied.');
    return;
  }
  
  console.log('📝 Table does not exist. Reading migration SQL...');
  
  const sql = fs.readFileSync('./supabase/migrations/20260123_social_post_jobs.sql', 'utf8');
  
  console.log('🚀 Executing migration...\n');
  console.log(sql.substring(0, 300) + '...\n');
  
  // Split by semicolon and execute each statement
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('COMMENT'));
  
  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i] + ';';
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    
    try {
      // Execute via REST API
      const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify({ sql: statement })
      });
      
      if (!response.ok) {
        const error = await response.text();
        console.error(`❌ Statement failed: ${error}`);
        
        // If exec RPC doesn't exist, inform user
        if (error.includes('exec')) {
          console.log('\n⚠️  The exec RPC function does not exist.');
          console.log('Please run the migration manually via Supabase Dashboard:');
          console.log('1. Go to: https://supabase.com/dashboard/project/zxcdkanccbdeqebnabgg/sql/new');
          console.log('2. Copy and paste the SQL from: supabase/migrations/20260123_social_post_jobs.sql');
          console.log('3. Click "Run"');
          process.exit(1);
        }
      }
    } catch (err) {
      console.error('Error executing statement:', err);
    }
  }
  
  console.log('\n✅ Migration completed!');
  console.log('🔍 Verifying table was created...');
  
  const nowExists = await checkTableExists();
  
  if (nowExists) {
    console.log('✅ Table social_post_jobs created successfully!');
  } else {
    console.log('⚠️  Could not verify table creation. Please check manually.');
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
