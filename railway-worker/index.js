/**
 * Social Post Worker
 * BullMQ worker for processing scheduled social media posts
 * 
 * Architecture:
 * 1. Scheduler runs every minute, finds due posts, adds to queue
 * 2. Worker processes jobs from queue, calls platform APIs
 * 3. Results stored back to Supabase
 */

const { Queue, Worker } = require('bullmq');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const NETLIFY_BASE_URL = process.env.NETLIFY_BASE_URL || 'https://dainty-horse-49c336.netlify.app';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// Redis connection config
const connection = {
  url: REDIS_URL,
  maxRetriesPerRequest: null
};

// Initialize Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Create queue
const postQueue = new Queue('social-posts', { connection });

console.log('🚀 Social Post Worker starting...');
console.log(`📡 Redis: ${REDIS_URL.replace(/\/\/.*@/, '//***@')}`);
console.log(`🗄️  Supabase: ${SUPABASE_URL}`);
console.log(`🌐 Netlify: ${NETLIFY_BASE_URL}`);

/**
 * Scheduler - runs every minute to find due posts
 */
async function scheduleJobs() {
  try {
    const now = new Date().toISOString();
    
    // Find posts that are due for processing
    const { data: duePosts, error } = await supabase
      .from('social_posts')
      .select('id, user_id, video_id, caption, platforms')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)
      .limit(50);
    
    if (error) {
      console.error('❌ Error querying due posts:', error);
      return;
    }
    
    if (!duePosts || duePosts.length === 0) {
      console.log('⏰ No posts due for processing');
      return;
    }
    
    console.log(`📬 Found ${duePosts.length} posts to process`);
    
    // Add each post to the queue
    for (const post of duePosts) {
      // Atomically mark as processing - only if still scheduled
      const { data: updated, error: updateError } = await supabase
        .from('social_posts')
        .update({ 
          status: 'processing',
          processed_at: new Date().toISOString()
        })
        .eq('id', post.id)
        .eq('status', 'scheduled') // Only update if still scheduled
        .select('id');
      
      // If no rows updated, another process already claimed this post
      if (updateError || !updated || updated.length === 0) {
        console.log(`⏭️ Post ${post.id} already claimed by another process, skipping`);
        continue;
      }
      
      // Add to queue with unique job ID to prevent duplicates
      await postQueue.add('publish', {
        postId: post.id,
        userId: post.user_id,
        videoId: post.video_id,
        caption: post.caption,
        platforms: post.platforms
      }, {
        jobId: `post-${post.id}`, // Unique ID prevents duplicate jobs
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: 100,
        removeOnFail: 100
      });
      
      console.log(`✅ Queued post ${post.id}`);
    }
    
  } catch (error) {
    console.error('❌ Scheduler error:', error);
  }
}

/**
 * Worker - processes jobs from the queue
 */
const worker = new Worker('social-posts', async (job) => {
  const { postId, userId, videoId, caption, platforms } = job.data;
  
  console.log(`🔄 Processing post ${postId} for platforms: ${platforms.join(', ')}`);
  
  try {
    // Call the unified publish endpoint (handles all platforms)
    console.log(`📤 Calling publish endpoint for post ${postId}...`);
    
    const response = await fetch(`${NETLIFY_BASE_URL}/.netlify/functions/social-post-worker`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': WEBHOOK_SECRET
      },
      body: JSON.stringify({
        postId: postId,
        userId: userId,
        videoId: videoId,
        caption: caption,
        platforms: platforms
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    
    console.log(`📝 Post ${postId} complete:`, data);
    
    return data;
    
  } catch (error) {
    console.error(`❌ Job failed for post ${postId}:`, error);
    
    // Mark post as failed
    await supabase
      .from('social_posts')
      .update({
        status: 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);
    
    throw error;
  }
}, { connection });

// Worker event handlers
worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

// Start scheduler (runs every minute)
console.log('⏰ Starting scheduler (every 60s)...');
scheduleJobs(); // Run immediately on start
setInterval(scheduleJobs, 60 * 1000);

// Keep process alive
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down...');
  await worker.close();
  process.exit(0);
});

console.log('✅ Worker ready and listening for jobs');
