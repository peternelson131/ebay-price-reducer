const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const fetch = require('node-fetch');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8';
const VIDEO_PATH = '/tmp/Bug_Bag.MOV';
const TARGET_LANGUAGE = 'es';
const API_BASE = 'https://dainty-horse-49c336.netlify.app/.netlify/functions';

async function runTest() {
  console.log('🧪 Full E2E Dubbing Test\n');
  
  // Step 1: Get access token
  console.log('1️⃣ Getting access token...');
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: linkData } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: 'petenelson13@gmail.com'
  });
  
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: sessionData, error: verifyError } = await anonClient.auth.verifyOtp({
    email: 'petenelson13@gmail.com',
    token: linkData.properties.email_otp,
    type: 'email'
  });
  
  if (verifyError) throw verifyError;
  const accessToken = sessionData.session.access_token;
  console.log('   ✅ Got access token\n');
  
  // Step 2: Upload video to Supabase Storage
  console.log('2️⃣ Uploading video to Supabase Storage...');
  const videoBuffer = fs.readFileSync(VIDEO_PATH);
  const timestamp = Date.now();
  const storagePath = `${USER_ID}/source_${timestamp}.mov`;
  
  const { error: uploadError } = await anonClient.storage
    .from('dubbed-videos')
    .upload(storagePath, videoBuffer, {
      contentType: 'video/quicktime'
    });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
  console.log(`   ✅ Uploaded: ${storagePath} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)\n`);

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
  
  if (!dubResponse.ok) {
    console.log('   ❌ Response:', JSON.stringify(dubResult, null, 2));
    throw new Error(`Dub video failed: ${dubResult.error}`);
  }
  
  console.log(`   ✅ Job started: ${dubResult.jobId}`);
  console.log(`   Dubbing ID: ${dubResult.dubbingId}\n`);

  // Step 4: Poll for status
  console.log('4️⃣ Polling for status (this may take several minutes)...');
  let attempts = 0;
  const maxAttempts = 120; // 10 minutes max
  
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000)); // Wait 5 seconds
    
    const statusResponse = await fetch(`${API_BASE}/dub-status?jobId=${dubResult.jobId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    const statusResult = await statusResponse.json();
    const progress = statusResult.progress ? ` (${statusResult.progress}%)` : '';
    process.stdout.write(`\r   Attempt ${attempts + 1}: ${statusResult.status}${progress}     `);
    
    if (statusResult.status === 'completed') {
      console.log(`\n\n   ✅ Dubbing complete!`);
      console.log(`   Download URL: ${statusResult.downloadUrl?.substring(0, 80)}...`);
      console.log(`\n🎉 SUCCESS! Video dubbed to Spanish.`);
      return;
    }
    
    if (statusResult.status === 'failed') {
      console.log(`\n\n   ❌ Dubbing failed: ${statusResult.error}`);
      throw new Error(`Dubbing failed: ${statusResult.error}`);
    }
    
    attempts++;
  }
  
  console.log('\n   ⚠️ Timed out after 10 minutes - job may still be processing');
}

runTest().catch(err => {
  console.error('\n\n❌ Test failed:', err.message);
  process.exit(1);
});
