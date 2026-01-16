const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function getToken() {
  // Try to generate an access token for the user
  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'petenelson13@gmail.com',
    options: {
      redirectTo: 'https://dainty-horse-49c336.netlify.app'
    }
  });
  
  if (error) {
    console.log('Magic link error:', error.message);
  } else {
    console.log('Magic link data:', JSON.stringify(data, null, 2));
  }
  
  // Try inviting - this generates a token
  const { data: userData, error: userError } = await supabase.auth.admin.getUserById(USER_ID);
  if (userData) {
    console.log('\nUser data:', JSON.stringify(userData, null, 2));
  }
}

getToken().catch(console.error);
