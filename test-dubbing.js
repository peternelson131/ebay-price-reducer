const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const fetch = require('node-fetch');

// Config
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = '94e1f3a0-6e1b-4d23-befc-750fe1832da8'; // Pete's user ID
const VIDEO_PATH = '/tmp/Bug_Bag.MOV';
const TARGET_LANGUAGE = 'es'; // Spanish

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function test() {
  console.log('🧪 Testing Dubbing Flow...\n');

  // Step 1: Check video exists
  console.log('1️⃣ Checking video file...');
  if (!fs.existsSync(VIDEO_PATH)) {
    throw new Error(`Video not found: ${VIDEO_PATH}`);
  }
  const videoBuffer = fs.readFileSync(VIDEO_PATH);
  console.log(`   ✅ Video: ${VIDEO_PATH} (${(videoBuffer.length / 1024 / 1024).toFixed(1)} MB)\n`);

  // Step 2: Upload to Supabase Storage
  console.log('2️⃣ Uploading to Supabase Storage...');
  const timestamp = Date.now();
  const storagePath = `${USER_ID}/source_${timestamp}.mov`;
  
  const { error: uploadError } = await supabase.storage
    .from('dubbed-videos')
    .upload(storagePath, videoBuffer, {
      contentType: 'video/quicktime',
      upsert: true
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }
  console.log(`   ✅ Uploaded: ${storagePath}\n`);

  // Step 3: Generate a JWT for Pete (service role can do this)
  console.log('3️⃣ Getting auth token...');
  const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(USER_ID);
  if (userError) throw new Error(`User error: ${userError.message}`);
  
  // Create a session for the user
  const { data: tokenData, error: tokenError } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: user.email
  });
  
  // For testing, we'll use the service role directly since we need to impersonate
  // Let's call the function directly with the storage path
  console.log(`   ✅ User: ${user.email}\n`);

  // Step 4: Call dub-video endpoint (we'll simulate the auth)
  console.log('4️⃣ Calling dub-video...');
  
  // For testing, let's manually process what the function would do
  // Get the Eleven Labs key
  const { data: keyRecord } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', USER_ID)
    .eq('service', 'elevenlabs')
    .single();

  if (!keyRecord) {
    throw new Error('Eleven Labs API key not found');
  }
  
  console.log('   ✅ Found Eleven Labs API key (encrypted)\n');

  // Since we can't easily decrypt without the ENCRYPTION_KEY env var,
  // let's just verify the storage and DB are working
  console.log('5️⃣ Creating dubbing job record...');
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 3);

  const { data: job, error: insertError } = await supabase
    .from('dubbing_jobs')
    .insert({
      user_id: USER_ID,
      dubbing_id: `test_${timestamp}`,
      source_language: 'en',
      target_language: TARGET_LANGUAGE,
      original_filename: 'Bug_Bag.MOV',
      file_size_bytes: videoBuffer.length,
      status: 'pending',
      expires_at: expiresAt.toISOString()
    })
    .select()
    .single();

  if (insertError) {
    throw new Error(`Insert failed: ${insertError.message}`);
  }
  
  console.log(`   ✅ Job created: ${job.id}\n`);

  // Clean up test data
  console.log('6️⃣ Cleaning up test data...');
  await supabase.from('dubbing_jobs').delete().eq('id', job.id);
  await supabase.storage.from('dubbed-videos').remove([storagePath]);
  console.log('   ✅ Cleaned up\n');

  console.log('✅ All infrastructure tests passed!');
  console.log('\n📋 Summary:');
  console.log('   - Supabase Storage upload: ✅');
  console.log('   - dubbing_jobs table: ✅');
  console.log('   - user_api_keys lookup: ✅');
  console.log('\n⚠️  Full end-to-end test requires calling the live endpoint with auth.');
  console.log('   Please test via the UI at: https://dainty-horse-49c336.netlify.app/asin-lookup');
}

test().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
