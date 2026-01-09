const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing Headphones via auto-list-single\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const token = verifyData.session.access_token;

  // Use Beats headphones - should map to category 112529
  const resp = await fetch(`${API}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      asin: 'B0C8PSMPTH',  // Beats Studio Pro
      price: '299.99',
      quantity: 1,
      condition: 'NEW',
      publish: true
    })
  });

  const result = await resp.json();
  console.log('Result:', JSON.stringify(result, null, 2));
  
  if (result.listingUrl) {
    console.log(`\n✅ SUCCESS: ${result.listingUrl}`);
  }
}

test().catch(console.error);
