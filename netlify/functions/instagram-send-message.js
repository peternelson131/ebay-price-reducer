/**
 * Instagram Send Message - Send DM replies
 * POST /instagram-send-message - Send a reply to an Instagram conversation
 * 
 * Body:
 * {
 *   conversation_id: "string", // Instagram conversation ID
 *   message: "string" // Text message to send
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Send a message via Instagram Graph API
 */
async function sendInstagramMessage(accessToken, conversationId, messageText) {
  const url = `https://graph.instagram.com/v18.0/${conversationId}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      access_token: accessToken,
      message: messageText
    })
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Instagram API error: ${data.error.message}`);
  }

  return data;
}

/**
 * Check if user can message (24-hour window or active conversation)
 */
async function canSendMessage(accessToken, conversationId, igUserId) {
  // Fetch conversation info to check message eligibility
  const url = new URL(`https://graph.instagram.com/v18.0/${conversationId}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,can_reply,updated_time,messages.limit(1){created_time,from}');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    console.error('Failed to check message eligibility:', data.error);
    return { canReply: false, reason: data.error.message };
  }

  // Instagram provides can_reply field for messaging window
  if (data.can_reply === false) {
    return { 
      canReply: false, 
      reason: '24-hour messaging window expired. Wait for user to message first.' 
    };
  }

  return { canReply: true };
}

/**
 * Store sent message in database
 */
async function storeSentMessage(conversationId, externalMessageId, messageText, igUserId) {
  const { data: dbConversation } = await supabase
    .from('inbox_conversations')
    .select('id, user_id')
    .eq('platform', 'instagram')
    .eq('external_id', conversationId)
    .single();

  if (!dbConversation) {
    console.warn('Conversation not found in database:', conversationId);
    return;
  }

  // Insert the sent message
  const { error } = await supabase
    .from('inbox_messages')
    .insert({
      conversation_id: dbConversation.id,
      external_id: externalMessageId,
      direction: 'outbound',
      content: messageText,
      message_type: 'text',
      sent_at: new Date().toISOString()
    });

  if (error && error.code !== '23505') { // Ignore duplicate key errors
    console.error('Failed to store sent message:', error);
  }

  // Update conversation last_message
  await supabase
    .from('inbox_conversations')
    .update({
      last_message: messageText,
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', dbConversation.id);
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;

    // Parse request body
    const { conversation_id, message } = JSON.parse(event.body || '{}');

    if (!conversation_id || !message) {
      return errorResponse(400, 'conversation_id and message are required', headers);
    }

    if (typeof message !== 'string' || message.trim().length === 0) {
      return errorResponse(400, 'message must be a non-empty string', headers);
    }

    if (message.length > 1000) {
      return errorResponse(400, 'message must be 1000 characters or less', headers);
    }

    // Get Instagram connection
    const { data: connection, error: connectionError } = await supabase
      .from('social_connections')
      .select('access_token, instagram_account_id')
      .eq('user_id', userId)
      .eq('platform', 'meta')
      .eq('is_active', true)
      .single();

    if (connectionError || !connection || !connection.instagram_account_id) {
      return errorResponse(404, 'Instagram account not connected', headers);
    }

    const accessToken = connection.access_token;
    const igUserId = connection.instagram_account_id;

    // Verify conversation belongs to user
    const { data: dbConversation, error: convError } = await supabase
      .from('inbox_conversations')
      .select('id')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('external_id', conversation_id)
      .single();

    if (convError || !dbConversation) {
      return errorResponse(404, 'Conversation not found or unauthorized', headers);
    }

    // Check if user can send message (24-hour window)
    const { canReply, reason } = await canSendMessage(accessToken, conversation_id, igUserId);
    
    if (!canReply) {
      return errorResponse(403, reason, headers);
    }

    // Send message via Instagram API
    const result = await sendInstagramMessage(accessToken, conversation_id, message.trim());

    // Store in database
    const messageId = result.id || `temp_${Date.now()}`;
    await storeSentMessage(conversation_id, messageId, message.trim(), igUserId);

    return successResponse({
      success: true,
      message_id: messageId,
      sent_at: new Date().toISOString()
    }, headers);

  } catch (error) {
    console.error('Instagram send message error:', error);
    
    // Check for specific Instagram API errors
    if (error.message && error.message.includes('24-hour')) {
      return errorResponse(403, error.message, headers);
    }
    
    return errorResponse(500, error.message || 'Failed to send message', headers);
  }
};
