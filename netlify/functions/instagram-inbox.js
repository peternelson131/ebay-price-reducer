/**
 * Instagram Inbox - Fetch conversations and messages
 * GET /instagram-inbox?conversation_id={id} - Get messages for a conversation
 * GET /instagram-inbox - Get list of conversations
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Fetch conversations from Instagram Graph API
 */
async function fetchInstagramConversations(accessToken, igUserId) {
  const url = new URL(`https://graph.instagram.com/v18.0/${igUserId}/conversations`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,updated_time,participants,messages.limit(1){message,from,created_time}');
  url.searchParams.set('limit', '25');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    throw new Error(`Instagram API error: ${data.error.message}`);
  }

  return data.data || [];
}

/**
 * Fetch messages for a specific conversation
 */
async function fetchConversationMessages(accessToken, conversationId, limit = 50) {
  const url = new URL(`https://graph.instagram.com/v18.0/${conversationId}/messages`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,message,from,created_time,attachments');
  url.searchParams.set('limit', limit.toString());

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    throw new Error(`Instagram API error: ${data.error.message}`);
  }

  return data.data || [];
}

/**
 * Get participant details from Instagram
 */
async function getParticipantInfo(accessToken, igUserId) {
  const url = new URL(`https://graph.instagram.com/v18.0/${igUserId}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,username,profile_picture_url');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    console.warn('Failed to fetch participant info:', data.error);
    return null;
  }

  return data;
}

/**
 * Sync conversation to database
 */
async function syncConversation(userId, conversation, accessToken, igUserId) {
  // Get participant info (the other person in the conversation)
  const participants = conversation.participants?.data || [];
  const otherParticipant = participants.find(p => p.id !== igUserId);
  
  let participantName = null;
  let participantAvatar = null;
  let participantId = null;

  if (otherParticipant) {
    participantId = otherParticipant.id;
    const participantInfo = await getParticipantInfo(accessToken, otherParticipant.id);
    
    if (participantInfo) {
      participantName = participantInfo.username;
      participantAvatar = participantInfo.profile_picture_url;
    }
  }

  // Get last message
  const lastMessage = conversation.messages?.data?.[0];
  const lastMessageText = lastMessage?.message || '';
  const lastMessageAt = lastMessage?.created_time || conversation.updated_time;

  // Upsert conversation
  const { data: dbConversation, error } = await supabase
    .from('inbox_conversations')
    .upsert({
      user_id: userId,
      platform: 'instagram',
      external_id: conversation.id,
      participant_name: participantName,
      participant_avatar: participantAvatar,
      participant_id: participantId,
      last_message: lastMessageText,
      last_message_at: new Date(lastMessageAt).toISOString(),
      updated_at: new Date().toISOString(),
      metadata: { raw_conversation: conversation }
    }, {
      onConflict: 'user_id,platform,external_id',
      returning: 'minimal'
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to sync conversation:', error);
    throw new Error('Failed to sync conversation to database');
  }

  return dbConversation;
}

/**
 * Sync messages to database
 */
async function syncMessages(conversationId, messages, igUserId) {
  const messagesToInsert = messages.map(msg => ({
    conversation_id: conversationId,
    external_id: msg.id,
    direction: msg.from?.id === igUserId ? 'outbound' : 'inbound',
    content: msg.message || null,
    message_type: msg.attachments?.data?.[0]?.image_data ? 'image' : 'text',
    attachments: msg.attachments?.data || null,
    sent_at: new Date(msg.created_time).toISOString(),
    metadata: { raw_message: msg }
  }));

  // Batch insert (ignore duplicates based on conversation_id + external_id unique constraint)
  const { error } = await supabase
    .from('inbox_messages')
    .upsert(messagesToInsert, {
      onConflict: 'conversation_id,external_id',
      ignoreDuplicates: true
    });

  if (error) {
    console.error('Failed to sync messages:', error);
    throw new Error('Failed to sync messages to database');
  }
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (handlePreflight(event)) {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }

    const userId = authResult.userId;
    const { conversation_id, sync } = event.queryStringParameters || {};

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

    // Case 1: Get messages for a specific conversation
    if (conversation_id) {
      // Get conversation from database
      const { data: dbConversation, error: convError } = await supabase
        .from('inbox_conversations')
        .select('*')
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .eq('external_id', conversation_id)
        .single();

      if (convError || !dbConversation) {
        return errorResponse(404, 'Conversation not found', headers);
      }

      // Fetch latest messages from Instagram
      if (sync === 'true') {
        const igMessages = await fetchConversationMessages(accessToken, conversation_id);
        await syncMessages(dbConversation.id, igMessages, igUserId);
      }

      // Return messages from database
      const { data: messages, error: messagesError } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('conversation_id', dbConversation.id)
        .order('sent_at', { ascending: false })
        .limit(100);

      if (messagesError) {
        return errorResponse(500, 'Failed to fetch messages', headers);
      }

      return successResponse({
        conversation: dbConversation,
        messages: messages || []
      }, headers);
    }

    // Case 2: Get list of conversations
    // Fetch from Instagram API
    const igConversations = await fetchInstagramConversations(accessToken, igUserId);

    // Sync conversations to database
    for (const conversation of igConversations) {
      await syncConversation(userId, conversation, accessToken, igUserId);
    }

    // Get blocklist
    const { data: blocklist } = await supabase
      .from('inbox_blocklist')
      .select('external_participant_id')
      .eq('user_id', userId)
      .eq('platform', 'instagram');

    const blockedIds = new Set(blocklist?.map(b => b.external_participant_id) || []);

    // Return conversations from database (excluding blocked)
    const { data: conversations, error: conversationsError } = await supabase
      .from('inbox_conversations')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'instagram')
      .eq('is_archived', false)
      .order('last_message_at', { ascending: false });

    if (conversationsError) {
      return errorResponse(500, 'Failed to fetch conversations', headers);
    }

    // Filter out blocked conversations
    const filteredConversations = conversations?.filter(
      conv => !blockedIds.has(conv.participant_id)
    ) || [];

    return successResponse({
      conversations: filteredConversations,
      total: filteredConversations.length
    }, headers);

  } catch (error) {
    console.error('Instagram inbox error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
