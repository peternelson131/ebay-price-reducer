# Backend Impact Assessment: Social Media Posting Service

**Date:** 2026-01-23  
**Assessed By:** Backend Agent  
**Status:** Complete  
**Feature:** Self-hosted multi-platform social media video posting

---

## Executive Summary

This is a **major backend expansion** introducing video transcoding, multi-platform OAuth, asynchronous job processing, and scheduled post execution. The good news: we have 50% of the foundation (Instagram/YouTube OAuth, Railway transcoder, Supabase storage). The challenge: 7 new platform integrations, OAuth token encryption, and robust error handling.

**Overall Complexity:** High  
**Risk Level:** Medium (mostly additive, minimal disruption to existing features)  
**Estimated Backend Effort:** 32-40 hours

---

## 1. Database Changes Required

### New Tables

#### `social_accounts`
Stores connected social media accounts with encrypted OAuth tokens.

```sql
CREATE TABLE social_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'instagram', 'youtube', 'tiktok', etc.
  platform_user_id TEXT NOT NULL, -- Platform's internal user ID
  username TEXT NOT NULL, -- Display name (@handle)
  
  -- Encrypted OAuth credentials
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  
  -- Platform-specific metadata
  platform_metadata JSONB DEFAULT '{}', -- e.g., FB page_id, IG business_account_id
  
  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  last_validated_at TIMESTAMPTZ DEFAULT now(),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one account per platform per user
  UNIQUE(user_id, platform, platform_user_id)
);

CREATE INDEX idx_social_accounts_user_id ON social_accounts(user_id);
CREATE INDEX idx_social_accounts_platform ON social_accounts(platform);
```

**Encryption Strategy:**
- Use Supabase's `pgcrypto` extension
- Store encryption key in environment variable (`SOCIAL_ACCOUNTS_ENCRYPTION_KEY`)
- Encrypt on write: `pgp_sym_encrypt(token, current_setting('app.encryption_key'))`
- Decrypt on read: `pgp_sym_decrypt(token_encrypted::bytea, current_setting('app.encryption_key'))`

#### `social_media`
Uploaded media files with transcoding status.

```sql
CREATE TABLE social_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Original file
  original_url TEXT NOT NULL, -- Supabase Storage path
  original_filename TEXT NOT NULL,
  original_mime_type TEXT NOT NULL,
  original_size_bytes BIGINT NOT NULL,
  
  -- Transcoded file
  transcoded_url TEXT, -- Universal H.264/AAC MP4
  transcoded_size_bytes BIGINT,
  transcoding_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  transcoding_error TEXT,
  
  -- Video metadata (extracted via ffprobe)
  duration_seconds NUMERIC(10,2),
  width INTEGER,
  height INTEGER,
  frame_rate NUMERIC(10,2),
  aspect_ratio TEXT, -- '9:16', '16:9', '1:1', etc.
  
  -- Lifecycle
  attached_to_post_id UUID, -- NULL if not yet attached
  delete_after TIMESTAMPTZ, -- Auto-cleanup: 24h if not attached, after post if attached
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_media_user_id ON social_media(user_id);
CREATE INDEX idx_social_media_delete_after ON social_media(delete_after) WHERE delete_after IS NOT NULL;
```

#### `social_posts`
Post content, scheduling, and status.

```sql
CREATE TABLE social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Content
  caption TEXT NOT NULL, -- Default caption for all platforms
  media_ids UUID[] DEFAULT '{}', -- References social_media.id
  
  -- Platform targeting
  target_accounts UUID[] NOT NULL, -- social_accounts.id[]
  
  -- Platform-specific overrides
  platform_configurations JSONB DEFAULT '{}', -- { instagram: { placement: 'reels' }, youtube: { title: 'My Video' } }
  account_configurations JSONB DEFAULT '{}', -- { account_id: { caption: 'Custom caption' } }
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ, -- NULL = post immediately
  timezone TEXT DEFAULT 'America/Chicago', -- User's timezone for display
  
  -- Status
  status TEXT DEFAULT 'draft', -- 'draft', 'scheduled', 'processing', 'posted', 'failed', 'cancelled'
  is_draft BOOLEAN DEFAULT false,
  
  -- Processing
  processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX idx_social_posts_status ON social_posts(status);
CREATE INDEX idx_social_posts_scheduled_at ON social_posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
```

#### `post_results`
Per-platform posting outcomes.

```sql
CREATE TABLE post_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  social_account_id UUID NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  
  -- Result
  success BOOLEAN NOT NULL,
  
  -- Error details (if failed)
  error_message TEXT,
  error_code TEXT, -- Platform-specific error codes
  
  -- Success details (if posted)
  platform_post_id TEXT, -- Instagram media ID, YouTube video ID, etc.
  platform_post_url TEXT, -- Direct link to the post
  
  -- Metadata
  attempted_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  retry_count INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_post_results_post_id ON post_results(post_id);
CREATE INDEX idx_post_results_account_id ON post_results(social_account_id);
```

### Schema Design Recommendations

**1. Use JSONB for Platform-Specific Data**
- `platform_configurations` and `account_configurations` allow flexibility without schema migrations per platform
- Use GIN indexes if we need to query specific platform configs: `CREATE INDEX idx_platform_configs ON social_posts USING GIN (platform_configurations);`

**2. Encryption Key Management**
- Store `SOCIAL_ACCOUNTS_ENCRYPTION_KEY` in Supabase secrets
- Rotate keys annually (requires re-encryption migration)
- Use separate key from other encrypted fields

**3. Cascade Deletes**
- User deletion cascades to all social data
- Post deletion cascades to results
- Account deletion should soft-delete (set `is_active = false`) to preserve post history

**4. Automatic Cleanup**
- Media files: Delete after 24h if not attached, or after post is completed
- Cron job: `DELETE FROM social_media WHERE delete_after < now()`
- Storage files: Use Supabase Storage lifecycle policies

**5. Timezone Handling**
- Store `scheduled_at` in UTC (TIMESTAMPTZ does this automatically)
- Store user's `timezone` for display purposes
- Frontend converts to local time for calendar UI

### Migration Strategy

**Phase 1: Core Tables (Day 1)**
```sql
-- migration: 001_social_posting_core.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE social_accounts (...);
CREATE TABLE social_media (...);
CREATE TABLE social_posts (...);
CREATE TABLE post_results (...);
```

**Phase 2: RLS Policies (Day 1)**
```sql
-- migration: 002_social_posting_rls.sql
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own accounts" ON social_accounts
  FOR ALL USING (auth.uid() = user_id);

-- Repeat for all tables
```

**Phase 3: Helper Functions (Day 2)**
```sql
-- migration: 003_social_posting_helpers.sql
CREATE OR REPLACE FUNCTION cleanup_expired_media()
RETURNS void AS $$
  DELETE FROM social_media WHERE delete_after < now();
$$ LANGUAGE sql SECURITY DEFINER;
```

**Rollback Strategy:**
- Migrations are atomic (wrapped in transactions)
- If rollback needed: `DROP TABLE` in reverse order
- No impact on existing features (isolated tables)

---

## 2. API Endpoints Needed

### Media Service

#### `POST /api/media/create-upload-url`
Request presigned URL for video upload.

**Request:**
```typescript
{
  filename: string;
  mime_type: 'video/mp4' | 'video/quicktime' | 'video/mov';
  size_bytes: number;
}
```

**Response:**
```typescript
{
  media_id: string; // UUID
  upload_url: string; // Supabase Storage presigned URL (15min TTL)
  expires_at: string; // ISO timestamp
}
```

**Implementation:**
```typescript
// netlify/functions/media-create-upload-url.ts
import { createClient } from '@supabase/supabase-js';

export const handler = async (event) => {
  const { filename, mime_type, size_bytes } = JSON.parse(event.body);
  
  // Create media record
  const { data: media } = await supabase
    .from('social_media')
    .insert({
      user_id: userId,
      original_filename: filename,
      original_mime_type: mime_type,
      original_size_bytes: size_bytes,
      transcoding_status: 'pending',
      delete_after: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    })
    .select()
    .single();
  
  // Generate presigned URL
  const { data: uploadData } = await supabase.storage
    .from('social-videos')
    .createSignedUploadUrl(`${userId}/${media.id}/original.${getExtension(mime_type)}`);
  
  return {
    media_id: media.id,
    upload_url: uploadData.signedUrl,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  };
};
```

#### `POST /api/media/{id}/transcode`
Trigger transcoding for uploaded video.

**Triggered by:** Client after successful upload to presigned URL

**Implementation:**
- Calls Railway transcoder service
- Updates `transcoding_status` to 'processing'
- Polls transcoder or receives webhook on completion

#### `GET /api/media`
List user's media files.

**Query Params:**
- `status`: Filter by transcoding_status
- `attached`: Filter by attachment status (true/false)

#### `DELETE /api/media/{id}`
Delete media file (both DB record and storage files).

### Post Service

#### `POST /api/posts`
Create new post.

**Request:**
```typescript
{
  caption: string;
  media_ids: string[]; // UUID[]
  target_accounts: string[]; // social_accounts.id[]
  scheduled_at?: string; // ISO timestamp, null = instant
  platform_configurations?: {
    instagram?: { placement: 'reels' | 'feed', video_cover_timestamp_ms?: number };
    youtube?: { title: string };
    // ... other platforms
  };
  is_draft?: boolean;
}
```

**Response:**
```typescript
{
  id: string;
  status: 'draft' | 'scheduled' | 'processing';
  scheduled_at?: string;
}
```

**Implementation:**
- Validate all media IDs exist and are transcoded
- Validate all account IDs exist and are active
- If `scheduled_at` is null, enqueue immediate processing
- If `scheduled_at` is future, schedule via cron
- If `is_draft`, save but don't schedule

#### `GET /api/posts`
List posts with filtering.

**Query Params:**
- `status`: 'all' | 'scheduled' | 'posted' | 'drafts'
- `start_date`, `end_date`: Date range for calendar view
- `limit`, `offset`: Pagination

**Response:**
```typescript
{
  posts: Array<{
    id: string;
    caption: string;
    media_count: number;
    target_accounts: Array<{ platform: string, username: string }>;
    scheduled_at?: string;
    status: string;
    results?: Array<{ platform: string, success: boolean, url?: string }>;
  }>;
  total: number;
}
```

#### `PATCH /api/posts/{id}`
Update post (reschedule, edit caption, change platforms).

**Restrictions:**
- Can't edit posts with status 'processing' or 'posted'
- Can reschedule 'scheduled' posts
- Can edit 'draft' posts freely

#### `DELETE /api/posts/{id}`
Cancel/delete post.

**Behavior:**
- Deletes post record
- Cascades to post_results
- Marks attached media for cleanup (24h delay)

#### `POST /api/posts/{id}/publish`
Manually trigger publishing (for drafts or rescheduling).

### Account Connection Service

#### `GET /api/social-accounts`
List connected accounts.

**Response:**
```typescript
{
  accounts: Array<{
    id: string;
    platform: string;
    username: string;
    is_active: boolean;
    last_validated_at: string;
  }>;
}
```

#### `GET /api/auth/{platform}/connect`
Initiate OAuth flow for platform.

**Supported Platforms:** instagram, facebook, youtube, tiktok, twitter, linkedin, pinterest, threads, bluesky

**Response:**
```typescript
{
  auth_url: string; // OAuth authorization URL
  state: string; // CSRF token
}
```

**Implementation:**
- Generate OAuth URL with required scopes (see Platform Integration Spec)
- Store state token in session for verification
- Redirect user to platform's authorization page

#### `GET /api/auth/{platform}/callback`
OAuth callback handler.

**Query Params:**
- `code`: Authorization code from platform
- `state`: CSRF token

**Implementation:**
1. Verify state token
2. Exchange code for access/refresh tokens
3. Fetch user profile from platform
4. Encrypt tokens
5. Insert into `social_accounts`
6. Redirect to dashboard with success message

#### `DELETE /api/social-accounts/{id}`
Disconnect account.

**Behavior:**
- Soft delete: Set `is_active = false`
- Revoke OAuth token with platform (best effort)
- Preserve post history

### Scheduling & Background Processing

#### Netlify Background Function: `process-scheduled-posts`
Runs every 5 minutes via cron.

**Logic:**
```typescript
export const handler = async () => {
  // Find posts scheduled in the past but not yet processed
  const { data: posts } = await supabase
    .from('social_posts')
    .select('*, social_accounts(*)')
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date().toISOString());
  
  for (const post of posts) {
    // Update status to 'processing'
    await supabase
      .from('social_posts')
      .update({ status: 'processing', processing_started_at: new Date() })
      .eq('id', post.id);
    
    // Process each target account
    for (const accountId of post.target_accounts) {
      await publishToAccount(post, accountId);
    }
    
    // Update final status
    const results = await getPostResults(post.id);
    const allSuccess = results.every(r => r.success);
    
    await supabase
      .from('social_posts')
      .update({ 
        status: allSuccess ? 'posted' : 'failed',
        processing_completed_at: new Date()
      })
      .eq('id', post.id);
  }
};
```

**Trigger:** Netlify Scheduled Functions
```toml
# netlify.toml
[[functions."process-scheduled-posts".schedule]]
cron = "*/5 * * * *" # Every 5 minutes
```

#### Background Function: `cleanup-expired-media`
Runs daily to delete old media files.

**Logic:**
```typescript
export const handler = async () => {
  const { data: expiredMedia } = await supabase
    .from('social_media')
    .select('id, original_url, transcoded_url')
    .lte('delete_after', new Date().toISOString());
  
  for (const media of expiredMedia) {
    // Delete from storage
    await supabase.storage.from('social-videos').remove([media.original_url]);
    if (media.transcoded_url) {
      await supabase.storage.from('social-videos').remove([media.transcoded_url]);
    }
    
    // Delete record
    await supabase.from('social_media').delete().eq('id', media.id);
  }
};
```

---

## 3. Security Considerations

### OAuth Token Storage

**Encryption Implementation:**

```sql
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Encryption helper function
CREATE OR REPLACE FUNCTION encrypt_token(token TEXT)
RETURNS TEXT AS $$
  SELECT encode(
    pgp_sym_encrypt(
      token,
      current_setting('app.social_encryption_key')
    ),
    'base64'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Decryption helper function
CREATE OR REPLACE FUNCTION decrypt_token(encrypted_token TEXT)
RETURNS TEXT AS $$
  SELECT pgp_sym_decrypt(
    decode(encrypted_token, 'base64'),
    current_setting('app.social_encryption_key')
  );
$$ LANGUAGE sql SECURITY DEFINER;
```

**Environment Variables:**
```bash
# Supabase Dashboard → Project Settings → Edge Functions → Secrets
SOCIAL_ENCRYPTION_KEY=<generate-with-openssl-rand-base64-32>
INSTAGRAM_CLIENT_ID=<from-meta-dev-console>
INSTAGRAM_CLIENT_SECRET=<from-meta-dev-console>
YOUTUBE_CLIENT_ID=<from-google-cloud-console>
YOUTUBE_CLIENT_SECRET=<from-google-cloud-console>
# ... repeat for all 9 platforms
```

**Key Rotation Strategy:**
1. Generate new key: `openssl rand -base64 32`
2. Add as `SOCIAL_ENCRYPTION_KEY_NEW`
3. Run migration to re-encrypt all tokens with new key
4. Delete old key
5. Rename new key to `SOCIAL_ENCRYPTION_KEY`

**Frequency:** Annually or on suspected compromise

### API Key Management Per Platform

**Secure Storage:**
- All platform credentials in Supabase secrets (not in code)
- Access via `process.env` in Netlify Functions
- Never expose in frontend

**OAuth App Configuration:**
| Platform | App Location | Redirect URI |
|----------|--------------|--------------|
| Instagram | Meta Developer Console | `https://app.ebay-price-reducer.com/api/auth/instagram/callback` |
| YouTube | Google Cloud Console | `https://app.ebay-price-reducer.com/api/auth/youtube/callback` |
| TikTok | TikTok for Developers | `https://app.ebay-price-reducer.com/api/auth/tiktok/callback` |
| Facebook | Meta Developer Console | `https://app.ebay-price-reducer.com/api/auth/facebook/callback` |
| Twitter | Twitter Developer Portal | `https://app.ebay-price-reducer.com/api/auth/twitter/callback` |
| LinkedIn | LinkedIn Developer Portal | `https://app.ebay-price-reducer.com/api/auth/linkedin/callback` |
| Pinterest | Pinterest Developer Portal | `https://app.ebay-price-reducer.com/api/auth/pinterest/callback` |
| Threads | Meta Developer Console | `https://app.ebay-price-reducer.com/api/auth/threads/callback` |
| Bluesky | Self-hosted/app password | N/A (uses app password) |

**Scopes to Request:**
- See Platform Integration Spec for exact scopes per platform
- Request minimum required scopes (principle of least privilege)

### Rate Limiting Strategy

**Per-User Limits (Prevent Abuse):**
```typescript
// netlify/functions/middleware/rate-limit.ts
const USER_LIMITS = {
  'media-upload': { max: 50, window: '1h' }, // 50 uploads/hour
  'post-create': { max: 100, window: '24h' }, // 100 posts/day
  'post-publish': { max: 50, window: '1h' } // 50 instant publishes/hour
};

export const rateLimit = async (userId: string, endpoint: string) => {
  const key = `ratelimit:${userId}:${endpoint}`;
  const count = await redis.incr(key);
  
  if (count === 1) {
    await redis.expire(key, parseDuration(USER_LIMITS[endpoint].window));
  }
  
  if (count > USER_LIMITS[endpoint].max) {
    throw new Error('Rate limit exceeded');
  }
};
```

**Per-Platform Limits (API Compliance):**
| Platform | Limit | Strategy |
|----------|-------|----------|
| Instagram | 25 posts/day | Queue posts, space 1h apart if batch |
| YouTube | 100 videos/day | Track daily count per account |
| TikTok | Varies by approval | Check API response, backoff on 429 |
| Twitter | 300 tweets/3h | Track per account, space 1min apart |
| LinkedIn | 150 posts/day | Track daily count |
| Pinterest | 50 pins/day | Track daily count |
| Threads | 500 posts/24h | Track daily count |
| Facebook | 50 posts/day | Track daily count |
| Bluesky | Self-hosted unlimited | No limits |

**Implementation:**
```typescript
// Platform-specific rate limiter
const PLATFORM_DAILY_LIMITS = {
  instagram: 25,
  youtube: 100,
  twitter: 100, // Conservative (300/3h = ~100/day)
  // ...
};

const checkPlatformLimit = async (accountId: string, platform: string) => {
  const today = new Date().toISOString().split('T')[0];
  const key = `platform_limit:${accountId}:${today}`;
  
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 86400); // 24h
  }
  
  if (count > PLATFORM_DAILY_LIMITS[platform]) {
    throw new Error(`Daily limit exceeded for ${platform}`);
  }
};
```

**Backoff on Rate Limit Errors:**
```typescript
const publishWithRetry = async (post, account, retries = 3) => {
  try {
    return await platformAPI.publish(post, account);
  } catch (error) {
    if (error.code === 'RATE_LIMIT' && retries > 0) {
      const delay = Math.pow(2, 3 - retries) * 60000; // Exponential backoff
      await sleep(delay);
      return publishWithRetry(post, account, retries - 1);
    }
    throw error;
  }
};
```

### Additional Security Measures

**1. CSRF Protection:**
- Use state tokens in OAuth flows
- Verify state matches session

**2. Input Validation:**
- Sanitize captions (strip HTML, limit length)
- Validate media MIME types before upload
- Check file sizes before presigned URL generation

**3. RLS Policies:**
- Enforce user can only access their own data
- No superuser queries from frontend

**4. Audit Logging:**
- Log all OAuth connections/disconnections
- Log all post publish attempts
- Store in separate `audit_logs` table

---

## 4. Integration Complexity

### Existing OAuth Implementations

**Instagram (Partially Complete):**
- **Status:** OAuth flow exists for profile connection
- **Scopes:** Currently has `instagram_business_basic`
- **Needs:** Add `instagram_business_content_publish` scope
- **Effort:** 2 hours (extend existing flow)

**YouTube (Partially Complete):**
- **Status:** OAuth flow exists
- **Scopes:** Currently has `youtube.readonly`
- **Needs:** Add `youtube.upload` scope, implement resumable upload
- **Effort:** 4 hours (resumable upload is complex)

### New Implementations Needed

#### **Facebook (Medium Complexity)**
- **Uses:** Meta Graph API (same as Instagram)
- **Scopes:** `pages_show_list`, `pages_manage_posts`, `publish_video`
- **Complexity:** Medium (reuse Meta OAuth, need page token exchange)
- **API Rate Limits:** 200 calls/hour per user, 50 posts/day per page
- **Effort:** 6 hours
- **Gotchas:** 
  - Requires Page access token (not user token)
  - Video upload is chunked for >1GB files
  - Async processing (must poll for completion)

#### **TikTok (High Complexity)**
- **Uses:** TikTok Content Posting API
- **Scopes:** `video.upload`, `video.publish`
- **Complexity:** High (requires app approval, complex OAuth)
- **API Rate Limits:** Varies by approval tier
- **Effort:** 10 hours
- **Gotchas:**
  - Requires TikTok for Developers approval (can take weeks)
  - Separate sandbox vs production environments
  - `is_aigc` flag required for AI content
  - Video must be uploaded via chunked upload

#### **Twitter/X (High Complexity)**
- **Uses:** Twitter API v2
- **Scopes:** `tweet.read`, `tweet.write`, `media.upload`
- **Complexity:** High (OAuth 2.0 with PKCE, strict rate limits)
- **API Rate Limits:** 300 tweets/3h, 50 media uploads/24h
- **Effort:** 8 hours
- **Gotchas:**
  - Video must be uploaded in chunks (INIT → APPEND → FINALIZE)
  - Must poll upload STATUS before tweeting
  - 2:20 duration limit (strict)
  - Elevated access required (costs $200/mo for API access)

#### **LinkedIn (Medium Complexity)**
- **Uses:** LinkedIn Marketing API
- **Scopes:** `w_member_social`
- **Complexity:** Medium (straightforward OAuth, asset registration)
- **API Rate Limits:** 150 posts/day per member
- **Effort:** 6 hours
- **Gotchas:**
  - Video must be registered as asset first
  - Organization posts require different permissions
  - Processing can take several minutes

#### **Pinterest (Medium Complexity)**
- **Uses:** Pinterest API v5
- **Scopes:** `boards:read`, `pins:read`, `pins:write`
- **Complexity:** Medium (straightforward OAuth, board selection)
- **API Rate Limits:** 50 pins/day per account
- **Effort:** 6 hours
- **Gotchas:**
  - Must specify board ID (requires board picker UI)
  - Video pins require destination link
  - Thumbnail selectable via timestamp

#### **Threads (Low Complexity)**
- **Uses:** Threads Graph API (via Meta)
- **Scopes:** `threads_basic`, `threads_content_publish`
- **Complexity:** Low (nearly identical to Instagram API)
- **API Rate Limits:** 500 posts/24h
- **Effort:** 3 hours
- **Gotchas:**
  - Async publishing like Instagram
  - Requires Instagram Business account

#### **Bluesky (Low Complexity)**
- **Uses:** AT Protocol (open, self-hostable)
- **Auth:** App password (no OAuth)
- **Complexity:** Low (simple REST API)
- **API Rate Limits:** Varies (self-hosted = unlimited)
- **Effort:** 4 hours
- **Gotchas:**
  - 50MB video limit (smallest of all platforms)
  - 60s duration limit
  - Uses different auth pattern (app password)

### Platform Integration Summary Table

| Platform | Complexity | OAuth Exists? | New Scopes? | Effort | Rate Limits | Key Challenges |
|----------|------------|---------------|-------------|--------|-------------|----------------|
| Instagram | Low | ✅ Yes | Yes | 2h | 25/day | Extend existing OAuth |
| YouTube | Medium | ✅ Yes | Yes | 4h | 100/day | Resumable uploads |
| Facebook | Medium | ⚠️ Partial | Yes | 6h | 50/day | Page token exchange |
| TikTok | **High** | ❌ No | N/A | 10h | Varies | App approval required |
| Twitter | **High** | ❌ No | N/A | 8h | 300/3h | Elevated access ($200/mo) |
| LinkedIn | Medium | ❌ No | N/A | 6h | 150/day | Asset registration |
| Pinterest | Medium | ❌ No | N/A | 6h | 50/day | Board selection |
| Threads | Low | ⚠️ Via Meta | Yes | 3h | 500/day | Reuse Instagram auth |
| Bluesky | Low | ❌ No (app password) | N/A | 4h | Unlimited | 50MB limit |

**Total Integration Effort:** 49 hours

### Phased Rollout Recommendation

**Phase 1 (MVP - Week 1):**
- Instagram (extend existing)
- YouTube (extend existing)
- Facebook (reuse Meta OAuth)
- **Total:** 12 hours

**Phase 2 (Week 2):**
- Threads (reuse Meta OAuth)
- Bluesky (simple API)
- LinkedIn (moderate complexity)
- **Total:** 13 hours

**Phase 3 (Week 3-4):**
- Pinterest (moderate complexity)
- Twitter (high complexity, $200/mo cost)
- TikTok (high complexity, approval wait)
- **Total:** 24 hours

---

## 5. Risks & Rollback

### What Could Go Wrong?

#### **1. OAuth Token Expiration (HIGH PROBABILITY)**
**Risk:** Refresh tokens expire or get revoked, posts fail silently.

**Mitigation:**
- Implement token refresh logic before each API call
- Validate tokens daily (background job)
- Email user if token validation fails
- UI indicator: "Account disconnected - reconnect required"

**Detection:**
```typescript
const validateToken = async (accountId: string) => {
  try {
    await platformAPI.getProfile(account.access_token);
    await supabase
      .from('social_accounts')
      .update({ last_validated_at: new Date() })
      .eq('id', accountId);
  } catch (error) {
    if (error.code === 'AUTH_FAILED') {
      await supabase
        .from('social_accounts')
        .update({ is_active: false })
        .eq('id', accountId);
      
      // Notify user
      await sendEmail({
        to: user.email,
        subject: 'Reconnect your social account',
        body: `Your ${account.platform} account needs to be reconnected.`
      });
    }
  }
};
```

#### **2. Platform API Changes (MEDIUM PROBABILITY)**
**Risk:** Platform updates API, breaks our integration.

**Mitigation:**
- Version all API calls (e.g., `/v2/media`)
- Monitor platform developer blogs/changelogs
- Wrap all platform calls in try-catch with logging
- Graceful degradation: Mark platform as "temporarily unavailable"

**Example:**
```typescript
const platformWorkers = {
  instagram: InstagramWorker,
  youtube: YouTubeWorker,
  // ...
};

const publishToAccount = async (post, accountId) => {
  try {
    const account = await getAccount(accountId);
    const worker = platformWorkers[account.platform];
    return await worker.publish(post, account);
  } catch (error) {
    if (error.code === 'API_VERSION_DEPRECATED') {
      // Log and notify admin
      logger.error('Platform API deprecated', { platform: account.platform, error });
      throw new Error(`${account.platform} integration temporarily unavailable`);
    }
    throw error;
  }
};
```

#### **3. Video Transcoding Failures (MEDIUM PROBABILITY)**
**Risk:** FFmpeg fails on edge case video formats/codecs.

**Mitigation:**
- Validate video format before accepting upload
- Provide clear error messages for unsupported formats
- Retry transcoding with different presets on failure
- Fallback: Allow user to re-upload different format

**Detection:**
```typescript
const transcode = async (mediaId: string) => {
  try {
    const result = await railwayTranscoder.transcode({
      input_url: media.original_url,
      output_format: 'h264_aac_mp4'
    });
    
    await supabase
      .from('social_media')
      .update({
        transcoded_url: result.url,
        transcoding_status: 'completed'
      })
      .eq('id', mediaId);
  } catch (error) {
    await supabase
      .from('social_media')
      .update({
        transcoding_status: 'failed',
        transcoding_error: error.message
      })
      .eq('id', mediaId);
    
    // Notify user
    await notifyUser(media.user_id, {
      type: 'error',
      message: 'Video transcoding failed. Please try a different format.'
    });
  }
};
```

#### **4. Scheduled Post Missed Execution (LOW PROBABILITY)**
**Risk:** Cron job fails, scheduled posts don't publish on time.

**Mitigation:**
- Use Netlify Scheduled Functions (99.9% uptime SLA)
- Run every 5 minutes (max 5min delay)
- Implement idempotency: Don't double-post if job runs twice
- Monitor: Alert if >10 posts are overdue

**Monitoring:**
```typescript
const checkOverduePosts = async () => {
  const { count } = await supabase
    .from('social_posts')
    .select('id', { count: 'exact' })
    .eq('status', 'scheduled')
    .lte('scheduled_at', new Date(Date.now() - 10 * 60 * 1000).toISOString()); // 10min overdue
  
  if (count > 10) {
    await alertAdmin({
      severity: 'high',
      message: `${count} posts overdue for publishing`
    });
  }
};
```

#### **5. Storage Cost Overruns (LOW PROBABILITY)**
**Risk:** User uploads many large videos, exceeds 100GB Supabase Pro limit.

**Mitigation:**
- Delete original files immediately after transcoding
- Enforce 30-day retention, delete after posting
- Show storage usage in UI
- Warn at 80% capacity

**Monitoring:**
```typescript
const checkStorageUsage = async () => {
  const { data } = await supabase.storage.from('social-videos').list('');
  const totalSizeGB = data.reduce((sum, file) => sum + file.metadata.size, 0) / 1e9;
  
  if (totalSizeGB > 80) { // 80GB of 100GB
    await warnUser({
      message: 'You are using 80% of your video storage. Old videos will be auto-deleted.'
    });
  }
};
```

#### **6. Platform Rate Limiting (HIGH PROBABILITY)**
**Risk:** Posting too fast triggers platform rate limits, blocks account.

**Mitigation:**
- Implement per-platform rate limiters (see Section 3)
- Space out batch posts (1-5min delay between posts)
- Retry with exponential backoff on 429 errors
- UI warning: "Posting to 5 accounts at once may take 10 minutes"

#### **7. OAuth App Approval Delays (MEDIUM PROBABILITY - TikTok, Twitter)**
**Risk:** TikTok/Twitter app approval takes weeks, delays feature launch.

**Mitigation:**
- **TikTok:** Apply for developer access immediately (can take 2-4 weeks)
- **Twitter:** Decide if $200/mo elevated access is worth it (or skip Twitter initially)
- **Phased Rollout:** Launch with 7 platforms first, add TikTok/Twitter later

**Decision Required:**
- Should we pay $200/mo for Twitter API access?
- Should we wait for TikTok approval or launch without it?

### Rollback Strategy

#### **Database Rollback**
```sql
-- Rollback migration (reverse order)
DROP TABLE IF EXISTS post_results CASCADE;
DROP TABLE IF EXISTS social_posts CASCADE;
DROP TABLE IF EXISTS social_media CASCADE;
DROP TABLE IF EXISTS social_accounts CASCADE;

-- Remove encryption helpers
DROP FUNCTION IF EXISTS encrypt_token;
DROP FUNCTION IF EXISTS decrypt_token;
```

**Risk:** If posts exist, rollback loses data.  
**Mitigation:** Only rollback in first 48 hours (beta period). After that, migrate forward only.

#### **API Endpoint Rollback**
- Deploy previous version of Netlify Functions
- Use Netlify's instant rollback feature
- No impact on existing app features (isolated routes)

#### **Feature Flag Rollback**
```typescript
// config.ts
export const FEATURE_FLAGS = {
  SOCIAL_POSTING: process.env.ENABLE_SOCIAL_POSTING === 'true'
};

// In UI
if (FEATURE_FLAGS.SOCIAL_POSTING) {
  // Show social posting features
}
```

**Rollback:** Set `ENABLE_SOCIAL_POSTING=false` in environment variables.  
**Effect:** Hides UI, disables API routes, but preserves data.

#### **Graceful Degradation**
If a single platform breaks:
```typescript
const PLATFORM_STATUS = {
  instagram: 'active',
  youtube: 'active',
  tiktok: 'disabled', // Temporarily disable without rolling back entire feature
  // ...
};

const publishToAccount = async (post, accountId) => {
  const account = await getAccount(accountId);
  
  if (PLATFORM_STATUS[account.platform] === 'disabled') {
    throw new Error(`${account.platform} posting is temporarily unavailable`);
  }
  
  // Proceed with publish
};
```

### Monitoring & Alerting

**Key Metrics to Track:**
1. **Post Success Rate:** % of posts that published successfully (target: >95%)
2. **Token Validation Failures:** # of accounts with expired tokens (alert if >10)
3. **Transcoding Failures:** % of videos that failed transcoding (target: <5%)
4. **Scheduled Post Delays:** Average delay from scheduled time to actual publish (target: <2min)
5. **Storage Usage:** Total GB used (alert at 80%)

**Implementation:**
```typescript
// netlify/functions/metrics.ts
export const handler = async () => {
  const metrics = {
    post_success_rate: await getPostSuccessRate(),
    token_failures: await getTokenFailures(),
    transcoding_failures: await getTranscodingFailures(),
    avg_delay: await getAvgSchedulingDelay(),
    storage_usage_gb: await getStorageUsage()
  };
  
  // Send to monitoring service (e.g., Sentry, Datadog)
  await sendMetrics(metrics);
  
  // Alert on thresholds
  if (metrics.post_success_rate < 0.95) {
    await alertAdmin('Post success rate below 95%');
  }
};
```

---

## Summary & Recommendations

### Backend Work Summary

| Category | Effort | Priority |
|----------|--------|----------|
| **Database Schema** | 4 hours | P0 (Critical) |
| **Media Service (Presigned URLs)** | 6 hours | P0 (Critical) |
| **Post CRUD APIs** | 8 hours | P0 (Critical) |
| **OAuth Integrations (Phase 1)** | 12 hours | P0 (Critical) |
| **Scheduling & Cron** | 6 hours | P0 (Critical) |
| **OAuth Integrations (Phase 2-3)** | 37 hours | P1 (High) |
| **Monitoring & Alerting** | 3 hours | P1 (High) |
| **Testing & Error Handling** | 4 hours | P1 (High) |

**Total Backend Effort:** 80 hours (~2 weeks for 1 backend dev, 1 week for 2 devs)

### Critical Decisions Needed

**1. Twitter API Cost:**
- $200/mo for elevated access (required for video posting)
- **Recommendation:** Launch without Twitter initially, add later if users request it

**2. TikTok Approval Wait:**
- Can take 2-4 weeks for developer approval
- **Recommendation:** Apply immediately, launch Phase 1 without TikTok

**3. Encryption Key Storage:**
- Where to store `SOCIAL_ENCRYPTION_KEY`?
- **Recommendation:** Supabase secrets (secure, accessible to Edge Functions)

**4. Rate Limiting Approach:**
- Per-user? Per-account? Per-platform?
- **Recommendation:** All three (see Section 3)

### Backend Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| OAuth token expiration | High | Medium | Token refresh + validation cron |
| Platform API changes | Medium | High | Version locking + monitoring |
| Transcoding failures | Medium | Medium | Retry + fallback formats |
| Missed scheduled posts | Low | High | Reliable cron + monitoring |
| Storage overruns | Low | Low | Auto-cleanup + warnings |
| Rate limiting | High | Medium | Per-platform limiters + backoff |

**Overall Risk Level:** Medium (manageable with proper monitoring and error handling)

### Go/No-Go Recommendation

**✅ GO** - This is a well-researched, high-value feature with clear technical specifications. The backend impact is significant but manageable with phased rollout.

**Why GO:**
- 80% of infrastructure already exists (Supabase, Railway, Netlify)
- Clear, detailed technical specs from Post-Bridge analysis
- Phased rollout reduces risk
- High user value (multi-platform posting saves hours of manual work)

**Conditions:**
1. Apply for TikTok developer access immediately (2-4 week wait)
2. Decide on Twitter ($200/mo cost) - recommend skip initially
3. Allocate 2 weeks for Phase 1 backend development
4. Coordinate with Frontend Agent for UI components
5. Set up monitoring/alerting before production launch

---

**Assessment Completed:** 2026-01-23  
**Backend Agent:** 🗄️  
**Status:** Ready for implementation planning
