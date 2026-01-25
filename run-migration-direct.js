#!/usr/bin/env node
/**
 * Run migration directly using database connection
 * This bypasses the need for psql or Supabase CLI complications
 */

const fs = require('fs');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing credentials in .env.local');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Could not extract project ref from URL');
  process.exit(1);
}

console.log(`📡 Connecting to Supabase project: ${projectRef}`);

// Use Supabase Management API to execute SQL
const sql = fs.readFileSync('./supabase/migrations/099_system_state_logins_disabled.sql', 'utf8');

const data = JSON.stringify({
  query: sql
});

const options = {
  hostname: `${projectRef}.supabase.co`,
  port: 443,
  path: '/rest/v1/rpc/query',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length,
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('✅ Migration executed successfully!');
      console.log('Response:', responseData);
      
      // Now verify by running the setup script
      console.log('\n📝 Verifying setup...');
      require('child_process').exec('node setup-login-disable-feature.js', (error, stdout, stderr) => {
        if (error) {
          console.log(stdout);
          console.error(stderr);
        } else {
          console.log(stdout);
        }
      });
    } else {
      console.error(`❌ Migration failed with status ${res.statusCode}`);
      console.error('Response:', responseData);
      console.log('\n💡 This endpoint may not exist. Please run the SQL manually in Supabase Dashboard:');
      console.log('1. Go to https://supabase.com/dashboard');
      console.log('2. Open SQL Editor');
      console.log('3. Run the SQL from: supabase/migrations/099_system_state_logins_disabled.sql');
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log('\n💡 Please run the SQL manually in Supabase Dashboard:');
  console.log('1. Go to https://supabase.com/dashboard');
  console.log('2. Open SQL Editor');
  console.log('3. Run the SQL from: supabase/migrations/099_system_state_logins_disabled.sql');
});

req.write(data);
req.end();
