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
      // Mark as queued to prevent duplicate processing
      await supabase
        .from('social_posts')
        .update({ 
          status: 'processing',
          processed_at: new Date().toISOString()
        })
        .eq('id', post.id)
        .eq('status', 'scheduled'); // Only update if still scheduled
      
      // Add to queue
      await postQueue.add('publish', {
        postId: post.id,
        userId: post.user_id,
        videoId: post.video_id,
        caption: post.caption,
        platforms: post.platforms
      }, {
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
    // Get video details
    const { data: video, error: videoError } = await supabase
      .from('product_videos')
      .select('id, social_ready_url, duration_seconds')
      .eq('id', videoId)
      .single();
    
    if (videoError || !video) {
      throw new Error('Video not found');
    }
    
    // Get social accounts
    const { data: accounts, error: accountError } = await supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('platform', platforms);
    
    if (accountError) {
      throw new Error('Failed to fetch social accounts');
    }
    
    // Process each platform
    const results = {};
    let overallSuccess = true;
    
    for (const platform of platforms) {
      const account = accounts.find(a => a.platform === platform);
      
      if (!account) {
        results[platform] = { success: false, error: 'Account not found' };
        overallSuccess = false;
        continue;
      }
      
      try {
        // Call the platform-specific posting endpoint
        const response = await fetch(`${NETLIFY_BASE_URL}/.netlify/functions/${platform}-post`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': WEBHOOK_SECRET
          },
          body: JSON.stringify({
            accountId: account.id,
            videoUrl: video.social_ready_url,
            caption: caption,
            duration: video.duration_seconds
          })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          results[platform] = {
            success: true,
            platformPostId: data.postId,
            platformUrl: data.url
          };
          
          // Store success result
          await supabase.from('post_results').insert({
            post_id: postId,
            social_account_id: account.id,
            platform: platform,
            success: true,
            platform_post_id: data.postId,
            platform_post_url: data.url,
            posted_at: new Date().toISOString()
          });
          
          console.log(`✅ ${platform}: Posted successfully`);
        } else {
          throw new Error(data.error || 'Posting failed');
        }
        
      } catch (platformError) {
        console.error(`❌ ${platform}: ${platformError.message}`);
        
        results[platform] = {
          success: false,
          error: platformError.message
        };
        overallSuccess = false;
        
        // Store error result
        await supabase.from('post_results').insert({
          post_id: postId,
          social_account_id: account?.id,
          platform: platform,
          success: false,
          error_message: platformError.message,
          posted_at: new Date().toISOString()
        });
      }
    }
    
    // Update post status
    await supabase
      .from('social_posts')
      .update({
        status: overallSuccess ? 'posted' : 'failed',
        updated_at: new Date().toISOString()
      })
      .eq('id', postId);
    
    console.log(`📝 Post ${postId} complete: ${overallSuccess ? 'SUCCESS' : 'PARTIAL/FAILED'}`);
    
    return results;
    
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
