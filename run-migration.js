#!/usr/bin/env node
/**
 * Run a specific migration directly against Supabase using pg-promise
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

async function runMigration(migrationFile) {
  const migrationPath = path.join(__dirname, 'supabase', 'migrations', migrationFile);
  
  console.log(`Reading migration: ${migrationPath}`);
  const sql = fs.readFileSync(migrationPath, 'utf8');
  
  console.log(`Executing migration: ${migrationFile}`);
  console.log('SQL preview:', sql.substring(0, 200) + '...\n');
  
  // Use Supabase REST API to execute SQL
  const url = new URL('/rest/v1/rpc/exec', supabaseUrl);
  
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseServiceKey,
      'Authorization': `Bearer ${supabaseServiceKey}`
    }
  };

  const data = JSON.stringify({ query: sql });

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('✅ Migration completed successfully!');
          console.log('Response:', body);
          resolve();
        } else {
          console.error('❌ Migration failed with status:', res.statusCode);
          console.error('Response:', body);
          console.log('\n⚠️  Note: If the exec RPC does not exist, you may need to run this SQL manually via Supabase dashboard.');
          console.log('Or use: supabase db reset (WARNING: drops all data) or supabase db push');
          reject(new Error(`Status ${res.statusCode}: ${body}`));
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Get migration file from command line args
const migrationFile = process.argv[2] || '20260123_social_post_jobs.sql';

console.log('🚀 Running Supabase Migration\n');

runMigration(migrationFile).then(() => {
  console.log('\n✅ Migration complete!');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Migration failed:', err.message);
  console.log('\n📝 To run manually, copy the SQL from:');
  console.log(`   supabase/migrations/${migrationFile}`);
  console.log('   And execute in Supabase Dashboard > SQL Editor');
  process.exit(1);
});
