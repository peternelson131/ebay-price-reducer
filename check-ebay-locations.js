/**
 * Check and Create eBay Merchant Locations
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zxcdkanccbdeqebnabgg.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

const EBAY_API_BASE = 'https://api.ebay.com';
const ALGORITHM = 'aes-256-cbc';

function decrypt(encryptedText) {
  if (!ENCRYPTION_KEY || !encryptedText) return null;
  try {
    const parts = encryptedText.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) { return null; }
}

async function refreshToken(refreshToken, clientId, clientSecret) {
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account'
    })
  });
  return response.json();
}

async function run() {
  console.log('📍 Checking eBay Merchant Locations\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  const { data: user } = await supabase
    .from('users')
    .select('*')
    .eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8')
    .single();

  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshTokenValue = decrypt(user.ebay_refresh_token);

  const tokens = await refreshToken(refreshTokenValue, clientId, clientSecret);
  const accessToken = tokens.access_token;
  console.log('🔑 Got access token\n');

  // Get existing locations
  console.log('📍 Fetching existing locations...');
  const locResponse = await fetch(
    `${EBAY_API_BASE}/sell/inventory/v1/location`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  const locations = await locResponse.json();
  console.log('Response:', JSON.stringify(locations, null, 2));

  if (!locations.locations || locations.locations.length === 0) {
    console.log('\n⚠️ No locations found. Creating default location...\n');

    // Create a default location
    const createResponse = await fetch(
      `${EBAY_API_BASE}/sell/inventory/v1/location/default`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          location: {
            address: {
              addressLine1: '123 Main St',
              city: 'Dallas',
              stateOrProvince: 'TX',
              postalCode: '75001',
              country: 'US'
            }
          },
          locationTypes: ['WAREHOUSE'],
          name: 'Default Warehouse',
          merchantLocationStatus: 'ENABLED'
        })
      }
    );

    if (!createResponse.ok) {
      const err = await createResponse.json();
      console.error('❌ Failed to create location:', JSON.stringify(err, null, 2));
      return;
    }

    console.log('✅ Default location created!');
  } else {
    console.log(`\n✅ Found ${locations.locations.length} location(s):`);
    locations.locations.forEach(loc => {
      console.log(`   - ${loc.merchantLocationKey}: ${loc.name || 'Unnamed'}`);
    });
  }
}

run().catch(console.error);
