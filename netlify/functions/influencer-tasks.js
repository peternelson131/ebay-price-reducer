/**
 * Influencer Tasks - Manage Amazon Influencer video upload tasks
 * 
 * GET /influencer-tasks - List pending and completed tasks
 * POST /influencer-tasks - Mark task as completed
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Marketplace to language mapping
const MARKETPLACE_LANGUAGES = {
  'US': 'English',
  'CA': 'English',
  'UK': 'English',
  'AU': 'English',
  'DE': 'German',
  'FR': 'French',
  'ES': 'Spanish',
  'IT': 'Italian',
  'MX': 'Spanish',
  'JP': 'Japanese'
};

function getMarketplaceLanguage(marketplace) {
  return MARKETPLACE_LANGUAGES[marketplace] || 'English';
}

// Language codes for dubbing
const MARKETPLACE_LANGUAGE_CODES = {
  'US': 'en',
  'CA': 'en',
  'UK': 'en',
  'AU': 'en',
  'DE': 'de',
  'FR': 'fr',
  'ES': 'es',
  'IT': 'it',
  'MX': 'es',
  'JP': 'ja'
};

function getMarketplaceLanguageCode(marketplace) {
  return MARKETPLACE_LANGUAGE_CODES[marketplace] || 'en';
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;

    // GET - List tasks
    if (event.httpMethod === 'GET') {
      const status = event.queryStringParameters?.status; // 'pending', 'completed', or all
      
      // Select tasks with video info
      let query = supabase
        .from('influencer_tasks')
        .select(`
          *,
          video:product_videos(
            id,
            filename,
            onedrive_path,
            file_size,
            upload_status
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (status) {
        query = query.eq('status', status);
      }

      const { data: tasks, error } = await query;

      if (error) {
        console.error('Failed to fetch tasks:', error);
        return errorResponse(500, 'Failed to fetch tasks', headers);
      }

      // Count pending tasks for alert badge
      const pendingCount = tasks?.filter(t => t.status === 'pending').length || 0;

      // Get all video IDs that have videos
      const videoIds = [...new Set((tasks || [])
        .filter(t => t.video?.id)
        .map(t => t.video.id))];

      // Fetch variants for all videos in one query
      let variantsByVideo = {};
      if (videoIds.length > 0) {
        console.log('Fetching variants for video IDs:', videoIds);
        const { data: variants, error: variantError } = await supabase
          .from('video_variants')
          .select('*')
          .in('original_video_id', videoIds);
        
        console.log('Variants found:', variants?.length || 0, 'Error:', variantError?.message);
        if (variants?.length > 0) {
          console.log('First variant:', JSON.stringify(variants[0]));
        }
        
        // Group variants by video ID and language code
        (variants || []).forEach(v => {
          if (!variantsByVideo[v.original_video_id]) {
            variantsByVideo[v.original_video_id] = {};
          }
          variantsByVideo[v.original_video_id][v.language_code] = v;
        });
        
        console.log('variantsByVideo:', JSON.stringify(variantsByVideo));
      }

      // Add helper fields for UI
      const enrichedTasks = (tasks || []).map(task => {
        const languageCode = getMarketplaceLanguageCode(task.marketplace);
        const variant = task.video?.id 
          ? variantsByVideo[task.video.id]?.[languageCode] 
          : null;
        
        return {
          ...task,
          hasVideo: !!task.video,
          requiresDubbing: ['DE', 'FR', 'ES', 'IT', 'MX', 'JP'].includes(task.marketplace),
          language: getMarketplaceLanguage(task.marketplace),
          languageCode,
          // Variant info for this marketplace's language
          variant: variant || null,
          dubStatus: variant?.dub_status || null,
          hasDubbedVideo: variant?.dub_status === 'complete'
        };
      });

      return successResponse({
        success: true,
        tasks: enrichedTasks,
        pendingCount
      }, headers);
    }

    // POST - Update task status
    if (event.httpMethod === 'POST') {
      const { taskId, action } = JSON.parse(event.body || '{}');

      if (!taskId) {
        return errorResponse(400, 'taskId required', headers);
      }

      if (action === 'complete') {
        const { error } = await supabase
          .from('influencer_tasks')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', taskId)
          .eq('user_id', userId);

        if (error) {
          console.error('Failed to complete task:', error);
          return errorResponse(500, 'Failed to complete task', headers);
        }

        return successResponse({
          success: true,
          message: 'Task marked as completed'
        }, headers);
      }

      if (action === 'reopen') {
        const { error } = await supabase
          .from('influencer_tasks')
          .update({ 
            status: 'pending',
            completed_at: null
          })
          .eq('id', taskId)
          .eq('user_id', userId);

        if (error) {
          console.error('Failed to reopen task:', error);
          return errorResponse(500, 'Failed to reopen task', headers);
        }

        return successResponse({
          success: true,
          message: 'Task reopened'
        }, headers);
      }

      if (action === 'delete') {
        const { error } = await supabase
          .from('influencer_tasks')
          .delete()
          .eq('id', taskId)
          .eq('user_id', userId);

        if (error) {
          console.error('Failed to delete task:', error);
          return errorResponse(500, 'Failed to delete task', headers);
        }

        return successResponse({
          success: true,
          message: 'Task deleted'
        }, headers);
      }

      return errorResponse(400, 'Invalid action', headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Error in influencer-tasks:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
