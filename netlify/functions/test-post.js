const { createClient } = require('@supabase/supabase-js');
const { decryptToken } = require('./utils/auth');

// Load env
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function test() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Get YouTube account
  const { data: account, error } = await supabase
    .from('social_accounts')
    .select('*')
    .eq('platform', 'youtube')
    .eq('is_active', true)
    .single();
  
  if (error) {
    console.log('Error:', error);
    return;
  }
  
  console.log('Account:', account?.username);
  
  // Decrypt token
  const accessToken = decryptToken(account.access_token);
  console.log('Token decrypted, length:', accessToken.length);
  
  // Test YouTube API with the token
  const fetch = (await import('node-fetch')).default;
  const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  const data = await response.json();
  console.log('YouTube API response:', JSON.stringify(data, null, 2));
}

test().catch(console.error);
