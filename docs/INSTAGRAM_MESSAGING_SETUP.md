# Instagram Messaging API Integration

## Overview

This integration enables a unified inbox for Instagram Direct Messages (DMs), allowing you to:
- Fetch Instagram conversations and messages
- Send replies to Instagram DMs
- Receive real-time message notifications via webhooks

## Architecture

### Database Tables (Supabase)

Created in migration: `20260124_instagram_inbox_tables.sql`

1. **inbox_conversations** - Stores conversation threads
   - Platform-agnostic design (supports Instagram, Facebook, WhatsApp, Twitter)
   - Tracks participant info, last message, unread count
   - Supports archiving and blocklist filtering

2. **inbox_messages** - Individual messages in conversations
   - Direction tracking (inbound/outbound)
   - Support for text, images, videos, attachments
   - Read receipts and timestamps

3. **inbox_blocklist** - Privacy filter
   - Hide specific contacts from unified inbox
   - Per-platform blocking
   - User-managed privacy controls

### Netlify Functions

1. **instagram-inbox.js**
   - `GET /instagram-inbox` - List all conversations
   - `GET /instagram-inbox?conversation_id={id}&sync=true` - Get messages for a conversation
   - Auto-syncs from Instagram Graph API to local database
   - Respects blocklist filtering

2. **instagram-send-message.js**
   - `POST /instagram-send-message` - Send a reply to a conversation
   - Validates 24-hour messaging window
   - Stores sent messages in database
   - Body: `{ conversation_id: "string", message: "string" }`

3. **instagram-webhook.js**
   - `GET /instagram-webhook` - Webhook verification endpoint
   - `POST /instagram-webhook` - Receive real-time message notifications
   - Auto-creates conversations and stores messages
   - Updates unread counts

## Meta App Configuration

### Existing App Credentials
- **App ID:** 1204583244636904
- **App Secret:** (in credentials.json)
- **Existing Permissions:**
  - `instagram_business_manage_messages` ✅
  - `Human Agent` ✅

### Webhook Setup

1. **Go to Meta App Dashboard:**
   ```
   https://developers.facebook.com/apps/1204583244636904/webhooks/
   ```

2. **Add Webhook Subscription:**
   - **Callback URL:** `https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook`
   - **Verify Token:** `instagram_webhook_token_2026` (set in env)
   - **Fields to Subscribe:**
     - ✅ `messages` - Instagram DM events
     - ✅ `messaging_postbacks` - Button/quick reply interactions

3. **Environment Variable Required:**
   ```env
   INSTAGRAM_WEBHOOK_VERIFY_TOKEN=instagram_webhook_token_2026
   ```

## Setup Instructions

### 1. Database Migration

Run the migration to create the inbox tables:

```bash
cd ~/clawd/projects/ebay-price-reducer
supabase migration up
```

Or manually apply:
```bash
psql $DATABASE_URL < supabase/migrations/20260124_instagram_inbox_tables.sql
```

### 2. Environment Variables

Ensure these are set in Netlify:

```env
# Meta/Instagram (already configured)
META_APP_ID=1204583244636904
META_APP_SECRET=<from credentials.json>

# Webhook verification
INSTAGRAM_WEBHOOK_VERIFY_TOKEN=instagram_webhook_token_2026

# Supabase (already configured)
SUPABASE_URL=<your-supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<your-service-key>
```

### 3. Deploy Functions

```bash
netlify deploy --prod
```

### 4. Configure Webhook in Meta App

1. Go to https://developers.facebook.com/apps/1204583244636904/webhooks/
2. Click "Add Subscription" for Instagram
3. Enter callback URL and verify token
4. Subscribe to `messages` field
5. Test by sending a DM to your Instagram business account

## API Usage

### Authentication

All endpoints require a Bearer token in the Authorization header:

```
Authorization: Bearer <supabase-jwt-token>
```

### 1. Fetch Conversations

```http
GET /.netlify/functions/instagram-inbox
Authorization: Bearer <token>
```

**Response:**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "platform": "instagram",
      "external_id": "conversation_id",
      "participant_name": "username",
      "participant_avatar": "url",
      "last_message": "Hey!",
      "last_message_at": "2026-01-24T19:00:00Z",
      "unread_count": 2
    }
  ],
  "total": 10
}
```

### 2. Fetch Messages

```http
GET /.netlify/functions/instagram-inbox?conversation_id={id}&sync=true
Authorization: Bearer <token>
```

**Response:**
```json
{
  "conversation": { ... },
  "messages": [
    {
      "id": "uuid",
      "external_id": "message_id",
      "direction": "inbound",
      "content": "Hello!",
      "sent_at": "2026-01-24T19:00:00Z",
      "read_at": null
    }
  ]
}
```

### 3. Send Message

```http
POST /.netlify/functions/instagram-send-message
Authorization: Bearer <token>
Content-Type: application/json

{
  "conversation_id": "conversation_id",
  "message": "Thanks for your message!"
}
```

**Response:**
```json
{
  "success": true,
  "message_id": "mid.xxx",
  "sent_at": "2026-01-24T19:00:00Z"
}
```

**Error (24-hour window expired):**
```json
{
  "error": "24-hour messaging window expired. Wait for user to message first."
}
```

## Instagram API Limitations

### 24-Hour Messaging Window

Instagram restricts messaging to **24 hours** after a user's last message:

- ✅ **Can reply:** Within 24 hours of user's last message
- ❌ **Cannot reply:** After 24 hours (unless user messages again)
- **Workaround:** None - this is an Instagram API policy

**How it works:**
1. User sends you a DM → 24-hour window opens
2. You can reply anytime within 24 hours
3. Each user message resets the 24-hour timer
4. After 24 hours with no user message → must wait for user to message again

**Detection:**
The API checks `can_reply` field before sending. If `false`, returns 403 error.

## Blocklist Management

### Add Contact to Blocklist

```sql
INSERT INTO inbox_blocklist (user_id, platform, external_participant_id, participant_name, reason)
VALUES ('user-uuid', 'instagram', 'instagram_user_id', '@username', 'Personal contact');
```

### Remove from Blocklist

```sql
DELETE FROM inbox_blocklist
WHERE user_id = 'user-uuid' AND platform = 'instagram' AND external_participant_id = 'instagram_user_id';
```

**Effect:** Blocklisted conversations are filtered out from `GET /instagram-inbox` results.

## Testing

### 1. Test Conversation Fetch

```bash
curl -X GET "https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox" \
  -H "Authorization: Bearer <your-token>"
```

### 2. Test Send Message

```bash
curl -X POST "https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-send-message" \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "conversation_id_here",
    "message": "Test reply"
  }'
```

### 3. Test Webhook (Meta will call this)

Webhook verification:
```bash
curl -X GET "https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook?hub.mode=subscribe&hub.verify_token=instagram_webhook_token_2026&hub.challenge=test123"
```

Should return: `test123`

## Monitoring

### Check Webhook Events

```sql
SELECT * FROM inbox_messages 
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

### Check Conversation Sync

```sql
SELECT platform, COUNT(*) as total, SUM(unread_count) as total_unread
FROM inbox_conversations
WHERE user_id = 'user-uuid'
GROUP BY platform;
```

### Check Blocklist

```sql
SELECT * FROM inbox_blocklist WHERE user_id = 'user-uuid';
```

## Troubleshooting

### Webhook Not Receiving Events

1. Verify webhook is subscribed to `messages` field in Meta App Dashboard
2. Check webhook URL is correct: `https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook`
3. Verify `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` matches in both Meta dashboard and Netlify env
4. Check Netlify function logs for incoming POST requests

### Can't Send Messages

1. **Error: "Instagram account not connected"**
   - User needs to connect Instagram via OAuth flow
   - Check `social_connections` table for active connection

2. **Error: "24-hour messaging window expired"**
   - This is normal Instagram behavior
   - Wait for user to message first
   - No workaround available

3. **Error: "Invalid token"**
   - Token may be expired (60 days)
   - User needs to reconnect via OAuth

### Messages Not Syncing

1. Check `social_connections.access_token` is valid
2. Verify `instagram_account_id` is set
3. Try manual sync with `?sync=true` parameter
4. Check Instagram API status: https://developers.facebook.com/status/

## Next Steps

### Future Enhancements

1. **Facebook Messenger Support**
   - Same tables, add `platform = 'facebook'`
   - Similar API patterns

2. **WhatsApp Business Support**
   - Requires WhatsApp Business API access
   - Uses similar Meta Graph API

3. **Read Receipts**
   - Mark messages as read when viewed
   - Update `read_at` timestamp

4. **Typing Indicators**
   - Send typing indicator while composing
   - Uses Instagram `sender_action` API

5. **Media Attachments**
   - Upload images/videos
   - Requires Media Upload API

6. **Quick Replies / Templates**
   - Pre-configured reply templates
   - Button-based interactions

## References

- **Instagram Graph API Docs:** https://developers.facebook.com/docs/messenger-platform/instagram
- **Messaging API:** https://developers.facebook.com/docs/messenger-platform/instagram/features/send-message
- **Webhooks:** https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook
- **Meta App Dashboard:** https://developers.facebook.com/apps/1204583244636904/

---

**Created:** 2026-01-24  
**Status:** Ready for Testing  
**MVP Scope:** Instagram DMs only (Facebook, WhatsApp coming later)
