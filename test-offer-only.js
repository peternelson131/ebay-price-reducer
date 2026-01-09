const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function decrypt(t) { const p=t.split(':'); const iv=Buffer.from(p.shift(),'hex'); const e=Buffer.from(p.join(':'),'hex'); const d=crypto.createDecipheriv('aes-256-cbc',Buffer.from(ENCRYPTION_KEY,'hex'),iv); return Buffer.concat([d.update(e),d.final()]).toString('utf8'); }

async function test() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
  const { data: user } = await supabase.from('users').select('*').eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8').single();

  const creds = Buffer.from(`${decrypt(user.ebay_client_id)}:${decrypt(user.ebay_client_secret)}`).toString('base64');
  const tokens = await (await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${creds}` },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: decrypt(user.ebay_refresh_token), scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory' })
  })).json();

  console.log('Creating offer with minimal headers...');
  
  const resp = await fetch('https://api.ebay.com/sell/inventory/v1/offer', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sku: 'wi_B0C8PSMPTH',
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: 1,
      categoryId: '112529',
      listingPolicies: {
        fulfillmentPolicyId: '107540197026',
        paymentPolicyId: '243561626026',
        returnPolicyId: '243561625026'
      },
      pricingSummary: { price: { currency: 'USD', value: '299.99' } },
      merchantLocationKey: 'loc-94e1f3a0-6e1b-4d23-befc-750fe183'
    })
  });

  const data = await resp.json();
  console.log('Response:', JSON.stringify(data, null, 2));
}

test().catch(console.error);
