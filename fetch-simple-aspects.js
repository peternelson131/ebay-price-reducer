const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function run() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();
  
  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshToken = decrypt(user.ebay_refresh_token);
  
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const tokens = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope' })
  }).then(r => r.json());

  const sampleCategories = [
    { id: '19006', name: 'Building Toys' },
    { id: '112529', name: 'Headphones' },
    { id: '260311', name: 'Pressure Cookers' },
    { id: '139973', name: 'Video Games' },
    { id: '139971', name: 'Video Game Consoles' },
  ];

  console.log('📥 Storing just aspect names\n');

  for (const cat of sampleCategories) {
    const url = `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${cat.id}`;
    const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokens.access_token}` } });
    const data = await resp.json();
    
    // Just the names
    const requiredAspects = (data.aspects || [])
      .filter(a => a.aspectConstraint?.aspectRequired === true)
      .map(a => a.localizedAspectName);

    const { error } = await supabase
      .from('ebay_category_aspects')
      .upsert({
        category_id: cat.id,
        category_name: cat.name,
        required_aspects: requiredAspects,
        fetched_at: new Date().toISOString()
      });

    console.log(`✅ ${cat.id}: ${cat.name}`);
    console.log(`   [${requiredAspects.join(', ')}]\n`);
  }
}

run().catch(console.error);
