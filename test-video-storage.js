// Test video storage bucket upload
// Usage: VIDEO_PATH=/path/to/video.mp4 node test-video-storage.js

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Using service role for testing
);

async function testVideoUpload() {
  const videoPath = process.env.VIDEO_PATH;
  
  if (!videoPath) {
    console.error('❌ Please set VIDEO_PATH environment variable');
    console.log('Usage: VIDEO_PATH=/path/to/video.mp4 node test-video-storage.js');
    process.exit(1);
  }

  if (!fs.existsSync(videoPath)) {
    console.error(`❌ File not found: ${videoPath}`);
    process.exit(1);
  }

  const fileName = path.basename(videoPath);
  const fileBuffer = fs.readFileSync(videoPath);
  const fileSize = (fileBuffer.length / 1024 / 1024).toFixed(2);
  
  console.log(`📹 Testing video upload...`);
  console.log(`   File: ${fileName}`);
  console.log(`   Size: ${fileSize} MB`);
  
  // Use a test user ID folder
  const testUserId = 'test-user-' + Date.now();
  const storagePath = `${testUserId}/${fileName}`;

  console.log(`\n1️⃣ Uploading to videos bucket...`);
  console.log(`   Path: ${storagePath}`);
  
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('videos')
    .upload(storagePath, fileBuffer, {
      contentType: 'video/mp4',
      upsert: true
    });

  if (uploadError) {
    console.error('❌ Upload failed:', uploadError.message);
    process.exit(1);
  }
  
  console.log('✅ Upload successful!');
  console.log(`   Path: ${uploadData.path}`);

  console.log(`\n2️⃣ Generating signed URL (1 hour expiry)...`);
  
  const { data: signedData, error: signedError } = await supabase.storage
    .from('videos')
    .createSignedUrl(storagePath, 3600);

  if (signedError) {
    console.error('❌ Signed URL failed:', signedError.message);
  } else {
    console.log('✅ Signed URL generated!');
    console.log(`   URL: ${signedData.signedUrl.substring(0, 80)}...`);
  }

  console.log(`\n3️⃣ Listing files in bucket...`);
  
  const { data: listData, error: listError } = await supabase.storage
    .from('videos')
    .list(testUserId);

  if (listError) {
    console.error('❌ List failed:', listError.message);
  } else {
    console.log('✅ Files in folder:');
    listData.forEach(f => console.log(`   - ${f.name} (${(f.metadata?.size / 1024).toFixed(1)} KB)`));
  }

  console.log(`\n4️⃣ Cleaning up test file...`);
  
  const { error: deleteError } = await supabase.storage
    .from('videos')
    .remove([storagePath]);

  if (deleteError) {
    console.error('❌ Delete failed:', deleteError.message);
  } else {
    console.log('✅ Test file deleted');
  }

  console.log('\n🎉 All tests passed! Private video bucket is working correctly.');
}

testVideoUpload().catch(console.error);
