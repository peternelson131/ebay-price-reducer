/**
 * Generate Thumbnail - Manual or automated thumbnail generation
 * 
 * POST /generate-thumbnail
 * Body: { taskId } or { asin, ownerId }
 * 
 * Generates a thumbnail for an influencer task or ASIN+owner combination
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth, verifyAuthOrWebhook } = require('./utils/auth');
const { generateThumbnailForTask, generateThumbnail } = require('./utils/thumbnail-generator');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Support both user auth and webhook (for automation)
    const authResult = await verifyAuthOrWebhook(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const isWebhook = authResult.isWebhook;
    const userId = authResult.userId;

    const { taskId, asin, ownerId } = JSON.parse(event.body || '{}');

    // Mode 1: Generate for existing task
    if (taskId) {
      let finalUserId = userId;
      
      // If webhook, look up userId from task
      if (isWebhook) {
        const { data: task } = await supabase
          .from('influencer_tasks')
          .select('user_id')
          .eq('id', taskId)
          .single();
        
        if (!task) {
          return errorResponse(404, 'Task not found', headers);
        }
        
        finalUserId = task.user_id;
      }

      const result = await generateThumbnailForTask(taskId, finalUserId);
      
      if (!result.success) {
        return errorResponse(400, result.error, headers);
      }

      return successResponse({
        success: true,
        thumbnailUrl: result.thumbnailUrl,
        message: 'Thumbnail generated successfully'
      }, headers);
    }

    // Mode 2: Generate for ASIN + owner combination
    if (asin && ownerId) {
      if (!userId) {
        return errorResponse(400, 'User authentication required for ASIN+owner mode', headers);
      }

      // Find template for this owner
      const { data: template, error: templateError } = await supabase
        .from('thumbnail_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('owner_id', ownerId)
        .single();

      if (templateError || !template) {
        return errorResponse(404, 'No template found for this owner', headers);
      }

      // Generate thumbnail
      const result = await generateThumbnail({
        templateId: template.id,
        asin,
        userId
      });

      if (!result.success) {
        return errorResponse(400, result.error, headers);
      }

      return successResponse({
        success: true,
        thumbnailUrl: result.thumbnailUrl,
        storagePath: result.storagePath,
        message: 'Thumbnail generated successfully'
      }, headers);
    }

    return errorResponse(400, 'Either taskId or (asin + ownerId) required', headers);

  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
