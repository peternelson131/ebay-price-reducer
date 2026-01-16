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
      
      let query = supabase
        .from('influencer_tasks')
        .select('*')
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

      return successResponse({
        success: true,
        tasks: tasks || [],
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
