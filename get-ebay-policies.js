/**
 * Get eBay Business Policies
 * 
 * Fetches fulfillment, payment, and return policies needed for creating offers
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

async function getPolicies() {
  console.log('📋 Getting eBay Business Policies\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false }
  });

  // Get Pete's eBay credentials
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', '94e1f3a0-6e1b-4d23-befc-750fe1832da8')
    .single();

  if (error || !user) {
    console.error('❌ Could not find user:', error);
    return;
  }

  const clientId = decrypt(user.ebay_client_id);
  const clientSecret = decrypt(user.ebay_client_secret);
  const refreshTokenValue = decrypt(user.ebay_refresh_token);

  // Get fresh access token
  console.log('🔑 Refreshing access token...');
  const tokens = await refreshToken(refreshTokenValue, clientId, clientSecret);
  
  if (tokens.error) {
    console.error('❌ Token refresh failed:', tokens);
    return;
  }

  const accessToken = tokens.access_token;
  console.log('✅ Got access token\n');

  // Fetch each policy type
  const policyTypes = ['FULFILLMENT', 'PAYMENT', 'RETURN_POLICY'];

  for (const policyType of policyTypes) {
    console.log(`📦 Fetching ${policyType} policies...`);
    
    const response = await fetch(
      `${EBAY_API_BASE}/sell/account/v1/${policyType.toLowerCase().replace('_policy', '')}_policy?marketplace_id=EBAY_US`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const data = await response.json();
    
    if (!response.ok) {
      console.error(`  ❌ Error:`, data);
      continue;
    }

    const policies = data[Object.keys(data).find(k => k.includes('olicies'))] || [];
    console.log(`  Found ${policies.length} ${policyType} policies:`);
    
    for (const policy of policies) {
      console.log(`    - ${policy.name} (ID: ${policy[Object.keys(policy).find(k => k.includes('olicyId'))]})${policy.marketplaceId ? ` [${policy.marketplaceId}]` : ''}`);
    }
    console.log('');
  }
}

getPolicies().catch(console.error);
