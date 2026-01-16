const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function verifyAndTest() {
  // First generate a new magic link
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  const { data: linkData } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'petenelson13@gmail.com'
  });
  
  const token = linkData.properties.hashed_token;
  console.log('Generated magic link token');
  
  // Verify it to get access token
  const verifyUrl = `${SUPABASE_URL}/auth/v1/verify`;
  const verifyResponse = await fetch(verifyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_SERVICE_KEY
    },
    body: JSON.stringify({
      token,
      type: 'magiclink'
    })
  });
  
  const verifyData = await verifyResponse.json();
  console.log('Verify response:', JSON.stringify(verifyData, null, 2));
  
  if (verifyData.access_token) {
    console.log('\n✅ Got access token!');
    console.log('Token:', verifyData.access_token.substring(0, 50) + '...');
    return verifyData.access_token;
  }
  
  throw new Error('Could not get access token');
}

verifyAndTest().catch(console.error);
