const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function test() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  
  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshToken = decrypt(user.ebay_refresh_token);
  
  // Get access token with just base scope
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokens = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope' })
  }).then(r => r.json());

  console.log('🔍 Testing eBay Taxonomy API\n');

  const testQueries = [
    'LEGO Creator Dinosaur Building Toy',
    'Beats Studio Pro Wireless Headphones',
    'Nintendo Switch Console',
    'Instant Pot Pressure Cooker',
  ];

  for (const query of testQueries) {
    console.log(`Query: "${query}"`);
    
    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_category_suggestions?q=${encodeURIComponent(query)}`;
    
    const response = await fetch(url, {
      headers: { 
        'Authorization': `Bearer ${tokens.access_token}`,
        'Accept': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.categorySuggestions) {
      data.categorySuggestions.slice(0, 3).forEach((s, i) => {
        console.log(`  ${i+1}. ${s.category.categoryName} (${s.category.categoryId})`);
      });
    } else {
      console.log(`  Response: ${JSON.stringify(data).substring(0, 100)}`);
    }
    console.log('');
  }
}

test().catch(console.error);
