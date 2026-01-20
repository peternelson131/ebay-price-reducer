/**
 * Cleanup Dubbed Videos - Scheduled function to purge expired files
 * 
 * Runs daily to delete dubbed videos older than 3 days from Supabase Storage.
 * 
 * Schedule: Daily at 3 AM UTC
 */

const { createClient } = require('@supabase/supabase-js');
const { verifyWebhook } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Netlify scheduled function config
exports.config = {
  schedule: "0 3 * * *" // Daily at 3 AM UTC
};

exports.handler = async (event, context) => {
  // ─────────────────────────────────────────────────────────
  // SECURITY: Verify this is a scheduled invocation
  // ─────────────────────────────────────────────────────────
  const isScheduled = context?.clientContext?.custom?.scheduled === true;
  const isWebhook = verifyWebhook(event);
  
  if (!isScheduled && !isWebhook) {
    console.warn('⚠️ Unauthorized invocation attempt');
    return {
      statusCode: 401,
      body: JSON.stringify({ error: 'Unauthorized' })
    };
  }

  console.log('🧹 Starting dubbed video cleanup...');

  try {
    const now = new Date();
    let deletedCount = 0;
    let errorCount = 0;

    // ─────────────────────────────────────────────────────────
    // Find expired jobs (older than 3 days)
    // ─────────────────────────────────────────────────────────
    const { data: expiredJobs, error: queryError } = await supabase
      .from('dubbing_jobs')
      .select('id, storage_path, expires_at')
      .lt('expires_at', now.toISOString())
      .not('storage_path', 'is', null);

    if (queryError) {
      console.error('Failed to query expired jobs:', queryError);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Failed to query expired jobs' })
      };
    }

    console.log(`📋 Found ${expiredJobs?.length || 0} expired jobs to clean up`);

    // ─────────────────────────────────────────────────────────
    // Delete each expired video
    // ─────────────────────────────────────────────────────────
    for (const job of expiredJobs || []) {
      try {
        // Delete from storage
        if (job.storage_path) {
          const { error: deleteError } = await supabase.storage
            .from('dubbed-videos')
            .remove([job.storage_path]);

          if (deleteError) {
            console.error(`Failed to delete file ${job.storage_path}:`, deleteError);
            errorCount++;
            continue;
          }
        }

        // Update job record (clear storage info, mark as expired)
        await supabase
          .from('dubbing_jobs')
          .update({
            storage_path: null,
            storage_url: null,
            status: 'expired'
          })
          .eq('id', job.id);

        deletedCount++;
        console.log(`✅ Deleted: ${job.storage_path}`);
      } catch (err) {
        console.error(`Error processing job ${job.id}:`, err);
        errorCount++;
      }
    }

    // ─────────────────────────────────────────────────────────
    // Also clean up orphaned storage files (safety net)
    // ─────────────────────────────────────────────────────────
    const { data: bucketFiles } = await supabase.storage
      .from('dubbed-videos')
      .list('', { limit: 1000 });

    // Check each folder (user_id folders)
    for (const folder of bucketFiles || []) {
      if (folder.id) continue; // Skip if it's a file, not folder
      
      const { data: userFiles } = await supabase.storage
        .from('dubbed-videos')
        .list(folder.name, { limit: 100 });

      for (const file of userFiles || []) {
        // Check if file is older than 3 days by filename timestamp
        const match = file.name.match(/^(\d+)_/);
        if (match) {
          const fileTimestamp = parseInt(match[1]);
          const fileAge = now.getTime() - fileTimestamp;
          const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

          if (fileAge > threeDaysMs) {
            const filePath = `${folder.name}/${file.name}`;
            console.log(`🗑️ Cleaning orphaned file: ${filePath}`);
            
            await supabase.storage
              .from('dubbed-videos')
              .remove([filePath]);
            
            deletedCount++;
          }
        }
      }
    }

    console.log(`🧹 Cleanup complete: ${deletedCount} deleted, ${errorCount} errors`);

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: `Cleanup complete: ${deletedCount} files deleted`,
        deleted: deletedCount,
        errors: errorCount
      })
    };

  } catch (error) {
    console.error('Cleanup error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
