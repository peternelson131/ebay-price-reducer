/**
 * Instagram Webhook - Receive real-time message notifications
 * GET /instagram-webhook - Webhook verification (Meta requires this)
 * POST /instagram-webhook - Receive message updates
 * 
 * Setup Instructions:
 * 1. Configure webhook in Meta App Dashboard: https://developers.facebook.com/apps/{app-id}/webhooks/
 * 2. Subscribe to 'messages' field for your Instagram page
 * 3. Use this URL: https://your-domain.netlify.app/.netlify/functions/instagram-webhook
 * 4. Set INSTAGRAM_WEBHOOK_VERIFY_TOKEN in environment variables
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const WEBHOOK_VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'instagram_webhook_token_2026';
const META_APP_SECRET = process.env.META_APP_SECRET;

/**
 * Verify webhook signature (security check from Meta)
 */
function verifySignature(body, signature) {
  if (!META_APP_SECRET) {
    console.warn('META_APP_SECRET not configured - skipping signature verification');
    return true;
  }

  if (!signature) {
    return false;
  }

  const elements = signature.split('=');
  const signatureHash = elements[1];
  
  const expectedHash = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signatureHash, 'utf8'),
    Buffer.from(expectedHash, 'utf8')
  );
}

/**
 * Get user ID from Instagram account ID
 */
async function getUserFromInstagramAccount(igAccountId) {
  const { data, error } = await supabase
    .from('social_connections')
    .select('user_id, access_token')
    .eq('platform', 'meta')
    .eq('instagram_account_id', igAccountId)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    console.warn('User not found for Instagram account:', igAccountId);
    return null;
  }

  return data;
}

/**
 * Fetch message details from Instagram
 */
async function fetchMessageDetails(accessToken, messageId) {
  const url = new URL(`https://graph.instagram.com/v18.0/${messageId}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,message,from,created_time,attachments');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    console.error('Failed to fetch message details:', data.error);
    return null;
  }

  return data;
}

/**
 * Fetch conversation details
 */
async function fetchConversationDetails(accessToken, conversationId) {
  const url = new URL(`https://graph.instagram.com/v18.0/${conversationId}`);
  url.searchParams.set('access_token', accessToken);
  url.searchParams.set('fields', 'id,updated_time,participants');

  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.error) {
    console.error('Failed to fetch conversation details:', data.error);
    return null;
  }

  return data;
}

/**
 * Get participant info
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
 * Process incoming message webhook
 */
async function processMessageWebhook(entry) {
  const { id: pageId, messaging } = entry;

  if (!messaging || !Array.isArray(messaging)) {
    return;
  }

  for (const event of messaging) {
    try {
      const { sender, recipient, message, timestamp } = event;

      if (!message) {
        continue; // Skip non-message events
      }

      // Get user from Instagram account
      const userData = await getUserFromInstagramAccount(recipient.id);
      
      if (!userData) {
        console.log('Skipping message - user not found for Instagram account:', recipient.id);
        continue;
      }

      const { user_id: userId, access_token: accessToken } = userData;

      // Determine conversation ID (Instagram uses sender ID as conversation in DMs)
      // For proper conversation tracking, we need to fetch the conversation
      const conversationId = `t_${sender.id}`; // Temporary ID format

      // Get or create conversation in database
      const { data: existingConv } = await supabase
        .from('inbox_conversations')
        .select('id')
        .eq('user_id', userId)
        .eq('platform', 'instagram')
        .eq('participant_id', sender.id)
        .single();

      let dbConversationId;

      if (existingConv) {
        dbConversationId = existingConv.id;

        // Update conversation
        await supabase
          .from('inbox_conversations')
          .update({
            last_message: message.text || '[Media]',
            last_message_at: new Date(timestamp).toISOString(),
            unread_count: supabase.rpc('increment', { x: 1 }),
            updated_at: new Date().toISOString()
          })
          .eq('id', dbConversationId);
      } else {
        // Fetch participant info
        const participantInfo = await getParticipantInfo(accessToken, sender.id);

        // Create new conversation
        const { data: newConv } = await supabase
          .from('inbox_conversations')
          .insert({
            user_id: userId,
            platform: 'instagram',
            external_id: conversationId,
            participant_id: sender.id,
            participant_name: participantInfo?.username || sender.id,
            participant_avatar: participantInfo?.profile_picture_url,
            last_message: message.text || '[Media]',
            last_message_at: new Date(timestamp).toISOString(),
            unread_count: 1
          })
          .select()
          .single();

        dbConversationId = newConv.id;
      }

      // Store message
      await supabase
        .from('inbox_messages')
        .insert({
          conversation_id: dbConversationId,
          external_id: message.mid,
          direction: 'inbound',
          content: message.text || null,
          message_type: message.attachments ? 'image' : 'text',
          attachments: message.attachments || null,
          sent_at: new Date(timestamp).toISOString(),
          metadata: { raw_event: event }
        });

      console.log('Processed Instagram message:', message.mid);
    } catch (error) {
      console.error('Error processing message event:', error);
    }
  }
}

exports.handler = async (event, context) => {
  // Handle webhook verification (GET request from Meta)
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};
    const mode = params['hub.mode'];
    const token = params['hub.verify_token'];
    const challenge = params['hub.challenge'];

    if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
      console.log('Webhook verified successfully');
      return {
        statusCode: 200,
        body: challenge
      };
    } else {
      console.error('Webhook verification failed - invalid token');
      return {
        statusCode: 403,
        body: 'Forbidden'
      };
    }
  }

  // Handle webhook events (POST request from Meta)
  if (event.httpMethod === 'POST') {
    const signature = event.headers['x-hub-signature-256'] || event.headers['X-Hub-Signature-256'];
    
    // Verify signature
    if (!verifySignature(event.body, signature)) {
      console.error('Invalid webhook signature');
      return {
        statusCode: 403,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    try {
      const body = JSON.parse(event.body);
      const { object, entry } = body;

      // Process Instagram messaging events
      if (object === 'instagram' && Array.isArray(entry)) {
        for (const entryItem of entry) {
          await processMessageWebhook(entryItem);
        }
      }

      // Always return 200 to acknowledge receipt
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };

    } catch (error) {
      console.error('Webhook processing error:', error);
      
      // Still return 200 to Meta to avoid retries
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true })
      };
    }
  }

  return {
    statusCode: 405,
    body: JSON.stringify({ error: 'Method not allowed' })
  };
};
