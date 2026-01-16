const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function getAccessToken() {
  // Create admin client
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  
  // Generate magic link with OTP
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'petenelson13@gmail.com'
  });
  
  if (linkError) throw linkError;
  
  const emailOtp = linkData.properties.email_otp;
  console.log('Generated OTP:', emailOtp);
  
  // Use anon client to verify OTP
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  const { data: sessionData, error: verifyError } = await anonClient.auth.verifyOtp({
    email: 'petenelson13@gmail.com',
    token: emailOtp,
    type: 'email'
  });
  
  if (verifyError) {
    console.log('Verify error:', verifyError);
    throw verifyError;
  }
  
  console.log('Session:', JSON.stringify(sessionData, null, 2));
  return sessionData.session.access_token;
}

getAccessToken()
  .then(token => console.log('\n✅ Access token:', token.substring(0, 50) + '...'))
  .catch(err => console.error('❌ Error:', err.message));
