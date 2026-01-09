const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function test() {
  console.log('🧪 Testing Auto-List Single Endpoint\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: userData } = await supabase.from('users').select('id, email').eq('email', 'petenelson13@gmail.com').single();
  const { data: linkData } = await supabase.auth.admin.generateLink({ type: 'magiclink', email: userData.email });
  const { data: verifyData } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: linkData.properties?.hashed_token });
  const authToken = verifyData.session.access_token;

  // Test with publish=false to avoid creating real listing
  const response = await fetch(`${API_BASE}/auto-list-single`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
    body: JSON.stringify({
      asin: 'B01KJEOCDW',  // LEGO Dinosaur
      price: '27.99',
      quantity: 1,
      publish: false  // Don't actually publish
    })
  });

  const result = await response.json();
  console.log('Response:', JSON.stringify(result, null, 2));

  if (result.success && result.offerId) {
    // Cleanup
    console.log('\n🧹 Cleaning up...');
    await fetch(`${API_BASE}/delete-ebay-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ offerId: result.offerId })
    });
    await fetch(`${API_BASE}/delete-ebay-inventory-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ sku: result.sku })
    });
    console.log('✅ Cleaned up');
  }
}

test().catch(console.error);
