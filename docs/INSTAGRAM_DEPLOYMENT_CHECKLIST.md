# Instagram Messaging Integration - Deployment Checklist

**Project:** eBay Price Reducer / OpSync Unified Inbox  
**Feature:** Instagram Direct Messaging API Integration  
**Date:** January 24, 2026

## Pre-Deployment Validation

### Code Review
- [ ] Review `supabase/migrations/20260124_instagram_inbox_tables.sql`
  - ✅ 3 tables created
  - ✅ 12 RLS policies defined
  - ✅ 9 indexes created
  - ✅ 1 trigger for auto-updating conversation timestamps
  
- [ ] Review `netlify/functions/instagram-inbox.js`
  - ✅ GET conversations endpoint
  - ✅ GET messages endpoint
  - ✅ Blocklist filtering
  - ✅ Error handling
  
- [ ] Review `netlify/functions/instagram-send-message.js`
  - ✅ POST send message endpoint
  - ✅ 24-hour window validation
  - ✅ Message length validation
  - ✅ Error handling
  
- [ ] Review `netlify/functions/instagram-webhook.js`
  - ✅ GET webhook verification
  - ✅ POST webhook processing
  - ✅ Signature verification
  - ✅ Error handling

### Security Audit
- [ ] RLS policies enabled on all tables
- [ ] JWT authentication required on all user-facing endpoints
- [ ] Webhook signature verification implemented
- [ ] No sensitive data exposed in error messages
- [ ] SQL injection prevention (parameterized queries via Supabase)
- [ ] CORS headers configured properly

## Staging Deployment

### 1. Database Migration (Staging)

```bash
# Connect to staging Supabase
cd ~/clawd/projects/ebay-price-reducer

# Run migration
supabase migration up --db-url <staging-db-url>

# Or manually
psql $STAGING_DATABASE_URL < supabase/migrations/20260124_instagram_inbox_tables.sql
```

**Verify:**
```sql
-- Check tables exist
SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'inbox_%';

-- Should return: inbox_conversations, inbox_messages, inbox_blocklist

-- Check RLS enabled
SELECT tablename, rowsecurity FROM pg_tables 
WHERE schemaname = 'public' AND tablename LIKE 'inbox_%';

-- Should show rowsecurity = true for all

-- Check policies
SELECT tablename, policyname FROM pg_policies 
WHERE schemaname = 'public' AND tablename LIKE 'inbox_%';

-- Should return 12 policies
```

- [ ] Tables created successfully
- [ ] RLS enabled on all tables
- [ ] Policies created (12 total)
- [ ] Indexes created (9 total)
- [ ] Trigger created

### 2. Environment Variables (Staging)

Set in Netlify staging environment:

```bash
netlify env:set INSTAGRAM_WEBHOOK_VERIFY_TOKEN "instagram_webhook_token_2026" --context staging
```

**Verify existing vars:**
- [ ] `META_APP_ID` - Set to 1204583244636904
- [ ] `META_APP_SECRET` - Set (check credentials.json)
- [ ] `SUPABASE_URL` - Staging URL
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Staging key
- [ ] `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` - Set to `instagram_webhook_token_2026`

### 3. Deploy Functions (Staging)

```bash
cd ~/clawd/projects/ebay-price-reducer

# Deploy to staging
netlify deploy --build --context staging

# Or specific branch
netlify deploy --build --alias staging
```

**Verify deployment:**
```bash
# Test health check
curl -I https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox

# Should return 401 Unauthorized (no token provided)
```

- [ ] Deployment successful
- [ ] Functions accessible
- [ ] Returns 401 without auth token

### 4. Configure Meta Webhook (Staging)

1. Go to https://developers.facebook.com/apps/1204583244636904/webhooks/

2. Add or edit Instagram webhook subscription:
   - **Callback URL:** `https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook`
   - **Verify Token:** `instagram_webhook_token_2026`
   - Click "Verify and Save"

3. Subscribe to fields:
   - [x] `messages` - DM events
   - [x] `messaging_postbacks` - Button/quick reply events

**Test verification:**
```bash
curl -X GET "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook?hub.mode=subscribe&hub.verify_token=instagram_webhook_token_2026&hub.challenge=test123"

# Should return: test123
```

- [ ] Webhook URL verified by Meta
- [ ] Subscribed to `messages` field
- [ ] Verification endpoint works

## Staging Testing

### 5. Test Authentication

```bash
# Get test JWT token from Supabase staging
TOKEN="<staging-jwt-token>"

# Test authenticated request
curl -X GET "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox" \
  -H "Authorization: Bearer $TOKEN"

# Should return conversations (or empty array if none)
```

- [ ] Authentication works
- [ ] Returns proper error for invalid token
- [ ] Returns data for valid token

### 6. Test Instagram Connection

Prerequisites:
- [ ] Test user has connected Instagram account in staging
- [ ] `social_connections` table has active `platform='meta'` entry
- [ ] `instagram_account_id` is populated

```bash
# Check connection in database
psql $STAGING_DATABASE_URL -c "SELECT user_id, platform, instagram_account_id, is_active FROM social_connections WHERE platform = 'meta';"
```

### 7. Test Conversation Fetch

```bash
# Fetch conversations
curl -X GET "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox" \
  -H "Authorization: Bearer $TOKEN"
```

**Verify:**
- [ ] Returns conversations from Instagram API
- [ ] Syncs to `inbox_conversations` table
- [ ] Excludes blocklisted participants
- [ ] Returns correct participant names/avatars

### 8. Test Message Fetch

```bash
# Get conversation_id from previous response
CONV_ID="<conversation-id>"

# Fetch messages
curl -X GET "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox?conversation_id=$CONV_ID&sync=true" \
  -H "Authorization: Bearer $TOKEN"
```

**Verify:**
- [ ] Returns messages for conversation
- [ ] Syncs to `inbox_messages` table
- [ ] Correct direction (inbound/outbound)
- [ ] Timestamps formatted correctly

### 9. Test Send Message

```bash
# Send a test reply
curl -X POST "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-send-message" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversation_id": "'$CONV_ID'",
    "message": "Test reply from staging"
  }'
```

**Verify:**
- [ ] Message sent successfully to Instagram
- [ ] Appears in Instagram DM thread
- [ ] Stored in `inbox_messages` table
- [ ] `last_message` updated in conversation
- [ ] Returns error if 24-hour window expired

### 10. Test Webhook

Send a DM to the connected Instagram account from a test account.

**Verify:**
- [ ] Webhook receives POST request
- [ ] Conversation created/updated in database
- [ ] Message stored in `inbox_messages`
- [ ] `unread_count` incremented
- [ ] Check Netlify function logs for webhook event

### 11. Test Blocklist

```sql
-- Add test participant to blocklist
INSERT INTO inbox_blocklist (user_id, platform, external_participant_id, participant_name)
VALUES ('<user-id>', 'instagram', '<instagram-user-id>', 'test_user');
```

```bash
# Fetch conversations
curl -X GET "https://staging--dainty-horse-49c336.netlify.app/.netlify/functions/instagram-inbox" \
  -H "Authorization: Bearer $TOKEN"
```

**Verify:**
- [ ] Blocklisted conversation filtered out
- [ ] Other conversations still returned
- [ ] Blocklist entry persists in database

## Production Deployment

### 12. Database Migration (Production)

```bash
# Run migration on production Supabase
supabase migration up --db-url <production-db-url>

# Or manually
psql $PRODUCTION_DATABASE_URL < supabase/migrations/20260124_instagram_inbox_tables.sql
```

**Verify (same as staging):**
- [ ] Tables created
- [ ] RLS enabled
- [ ] Policies created
- [ ] Indexes created
- [ ] Trigger created

### 13. Environment Variables (Production)

```bash
netlify env:set INSTAGRAM_WEBHOOK_VERIFY_TOKEN "instagram_webhook_token_2026" --context production
```

**Verify:**
- [ ] All required env vars set in production

### 14. Deploy Functions (Production)

```bash
netlify deploy --prod --build
```

- [ ] Production deployment successful
- [ ] Functions accessible

### 15. Configure Meta Webhook (Production)

Update webhook URL to production:
- **Callback URL:** `https://dainty-horse-49c336.netlify.app/.netlify/functions/instagram-webhook`
- **Verify Token:** `instagram_webhook_token_2026`

- [ ] Production webhook verified
- [ ] Subscribed to `messages` field

### 16. Production Smoke Tests

Run same tests as staging (steps 5-11) against production endpoints.

- [ ] Authentication works
- [ ] Conversation fetch works
- [ ] Message fetch works
- [ ] Send message works
- [ ] Webhook works
- [ ] Blocklist works

## Post-Deployment

### 17. Monitoring Setup

- [ ] Set up alerts for function errors
- [ ] Monitor webhook event processing
- [ ] Track message send success rate
- [ ] Monitor database growth

### 18. User Acceptance Testing

- [ ] Test with Pete's @petesflips account
- [ ] Verify Jessica can access inbox
- [ ] Test blocklist for personal contacts
- [ ] Verify 24-hour window messaging

### 19. Documentation

- [ ] Update user documentation
- [ ] Add API docs to internal wiki
- [ ] Create troubleshooting runbook
- [ ] Document common error scenarios

## Rollback Plan

If issues arise:

1. **Disable webhook in Meta App Dashboard**
   - Prevents new events from being processed

2. **Revert Netlify deployment**
   ```bash
   netlify rollback
   ```

3. **Database rollback (if needed)**
   ```sql
   DROP TABLE inbox_messages;
   DROP TABLE inbox_conversations;
   DROP TABLE inbox_blocklist;
   DROP FUNCTION update_conversation_timestamp();
   ```

## Sign-off

- [ ] Backend Agent: Implementation complete
- [ ] QA Agent: Testing passed
- [ ] DevOps Agent: Deployment successful
- [ ] Product Owner: UAT approved
- [ ] Security: Audit passed

---

**Deployment Date:** _____________  
**Deployed By:** _____________  
**Sign-off:** _____________
