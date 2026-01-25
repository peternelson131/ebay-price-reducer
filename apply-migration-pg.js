#!/usr/bin/env node
/**
 * Apply migration using pg library with Supabase direct connection
 * Requires database password - will prompt or use from environment
 */

const fs = require('fs');
const { Client } = require('pg');
const readline = require('readline');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.SUPABASE_URL;
const projectRef = supabaseUrl?.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];

if (!projectRef) {
  console.error('❌ Could not extract project ref from SUPABASE_URL');
  process.exit(1);
}

// Connection string for Supabase
// Format: postgresql://postgres.[project-ref]:[password]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
const DB_HOST = `aws-0-us-west-1.pooler.supabase.com`;
const DB_PORT = 5432;
const DB_NAME = 'postgres';
const DB_USER = `postgres.${projectRef}`;

async function getPassword() {
  // Check if password in env first
  if (process.env.SUPABASE_DB_PASSWORD) {
    return process.env.SUPABASE_DB_PASSWORD;
  }

  // Prompt for password
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter Supabase database password: ', (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function runMigration() {
  console.log(`📡 Connecting to Supabase database: ${projectRef}...`);
  
  const password = await getPassword();
  
  const client = new Client({
    host: DB_HOST,
    port: DB_PORT,
    database: DB_NAME,
    user: DB_USER,
    password: password,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    const sql = fs.readFileSync('./supabase/migrations/099_system_state_logins_disabled.sql', 'utf8');
    
    console.log('📝 Executing migration...');
    const result = await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    console.log('Result:', result);

    // Verify the setting
    const checkResult = await client.query(
      "SELECT * FROM system_state WHERE key = 'logins_disabled'"
    );
    
    console.log('\n✅ Verification:');
    console.log(checkResult.rows);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    
    if (error.message.includes('password')) {
      console.log('\n💡 Hint: Get the database password from Supabase Dashboard:');
      console.log('1. Go to https://supabase.com/dashboard/project/' + projectRef);
      console.log('2. Settings > Database > Connection string');
      console.log('3. Copy the password from the connection pooler string');
      console.log('4. Set it as: export SUPABASE_DB_PASSWORD="your-password"');
    } else {
      console.log('\n💡 Please run the SQL manually in Supabase Dashboard instead.');
    }
  } finally {
    await client.end();
  }
}

runMigration();
