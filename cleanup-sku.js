const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory' })
  }).then(r => r.json());

  const sku = 'wi_B01KJEOCDW';
  
  // Get offers for SKU
  console.log(`Getting offers for ${sku}...`);
  const offers = await fetch(`https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`, {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
  }).then(r => r.json());
  
  console.log('Offers:', JSON.stringify(offers, null, 2));
  
  if (offers.offers) {
    for (const offer of offers.offers) {
      console.log(`Deleting offer ${offer.offerId}...`);
      await fetch(`https://api.ebay.com/sell/inventory/v1/offer/${offer.offerId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${tokens.access_token}` }
      });
    }
  }
  
  // Delete inventory item
  console.log(`Deleting inventory item ${sku}...`);
  await fetch(`https://api.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokens.access_token}` }
  });
  
  console.log('✅ Cleaned up!');
}
run().catch(console.error);
