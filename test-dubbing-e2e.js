const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';
const USER_EMAIL = 'petenelson13@gmail.com';
const VIDEO_PATH = '/tmp/Bug_Bag.MOV';
const TARGET_LANGUAGE = 'es';
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function test() {
  console.log('🧪 Full E2E Dubbing Test\n');

  // Step 1: Get a valid access token for Pete
  console.log('1️⃣ Getting access token for Pete...');
  
  // We need to sign in as Pete - let's use the service role to create a session
  const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession(USER_ID);
  
  if (sessionError) {
    console.log('   Cannot create session directly, trying different approach...');
    
    // Alternative: Use service role key as bearer token and modify the endpoint to accept it
    // For now, let's test with direct Supabase calls
    
    // Actually, let's just test the Eleven Labs API directly with Pete's decrypted key
    // We need the encryption key from Netlify env
    throw new Error('Need ENCRYPTION_KEY to decrypt API key for direct testing');
  }
  
  const accessToken = sessionData.session.access_token;
  console.log(`   ✅ Got access token\n`);

  // Step 2: Upload video to storage
  console.log('2️⃣ Uploading video to Supabase Storage...');
  const videoBuffer = fs.readFileSync(VIDEO_PATH);
  const timestamp = Date.now();
  const storagePath = `${USER_ID}/source_${timestamp}.mov`;
  
  const { error: uploadError } = await supabase.storage
    .from('dubbed-videos')
    .upload(storagePath, videoBuffer, {
      contentType: 'video/quicktime'
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log(`   ✅ Uploaded: ${storagePath}\n`);

  // Step 3: Call dub-video endpoint
  console.log('3️⃣ Calling dub-video endpoint...');
  const dubResponse = await fetch(`${API_BASE}/dub-video`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      storagePath,
      targetLanguage: TARGET_LANGUAGE,
      originalFilename: 'Bug_Bag.MOV'
    })
  });

  const dubResult = await dubResponse.json();
  console.log('   Response:', JSON.stringify(dubResult, null, 2));

  if (!dubResponse.ok) {
    throw new Error(`Dub video failed: ${dubResult.error}`);
  }
  console.log(`   ✅ Job started: ${dubResult.jobId}\n`);

  // Step 4: Poll for status
  console.log('4️⃣ Polling for status...');
  let attempts = 0;
  const maxAttempts = 60; // 5 minutes max
  
  while (attempts < maxAttempts) {
    const statusResponse = await fetch(`${API_BASE}/dub-status?jobId=${dubResult.jobId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const statusResult = await statusResponse.json();
    console.log(`   Attempt ${attempts + 1}: ${statusResult.status}`);
    
    if (statusResult.status === 'completed') {
      console.log(`\n   ✅ Dubbing complete!`);
      console.log(`   Download URL: ${statusResult.downloadUrl}`);
      return;
    }
    
    if (statusResult.status === 'failed') {
      throw new Error(`Dubbing failed: ${statusResult.error}`);
    }
    
    attempts++;
    await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
  }
  
  console.log('   ⚠️ Timed out waiting for completion');
}

test().catch(err => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
