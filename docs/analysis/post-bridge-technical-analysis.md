# Post-Bridge Technical Analysis

**Date:** 2026-01-23  
**Purpose:** Reverse-engineer Post-Bridge architecture for self-hosted implementation

---

## Executive Summary

Post-Bridge is a unified social media posting API that abstracts away platform-specific complexity. This analysis documents their technical architecture for recreation.

---

## API Architecture

### Base URL
```
https://api.post-bridge.com/v1
```

### Authentication
- Bearer token in Authorization header
- API keys managed per workspace

---

## Core Endpoints

### Media Management

```
POST   /v1/media/create-upload-url   → Get presigned URL for upload
GET    /v1/media                      → List media
GET    /v1/media/{id}                 → Get media by ID
DELETE /v1/media/{id}                 → Delete media
```

**Key Insight: Presigned URL Pattern**
```javascript
// Step 1: Request upload URL
const response = await fetch('/v1/media/create-upload-url', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer API_KEY'
  },
  body: JSON.stringify({
    name: 'video.mp4',
    mime_type: 'video/mp4',
    size_bytes: 12345678
  })
});

const { media_id, upload_url } = await response.json();

// Step 2: Upload directly to presigned URL (S3/GCS)
await fetch(upload_url, {
  method: 'PUT',
  headers: { 'Content-Type': 'video/mp4' },
  body: file
});

// Step 3: Use media_id in post creation
```

**Supported MIME Types:**
- `image/png`
- `image/jpeg`
- `video/mp4`
- `video/quicktime` (MOV - they handle transcoding!)

**Media Lifecycle:**
- Deleted after post is published
- Deleted after 24 hours if not attached
- Deleted when scheduled post is deleted

---

### Posts

```
POST   /v1/posts           → Create post
GET    /v1/posts           → List posts (with filters)
GET    /v1/posts/{id}      → Get post
PATCH  /v1/posts/{id}      → Update post
DELETE /v1/posts/{id}      → Delete post
```

**CreatePostDto:**
```typescript
{
  caption: string;              // Required
  social_accounts: number[];    // Required - account IDs to post to
  media?: string[];             // Media IDs from upload
  media_urls?: string[];        // OR public URLs (fallback)
  scheduled_at?: string;        // ISO date, null = post instantly
  platform_configurations?: {   // Platform-specific overrides
    instagram?: InstagramConfig;
    facebook?: FacebookConfig;
    youtube?: YoutubeConfig;
    tiktok?: TiktokConfig;
    twitter?: TwitterConfig;
    linkedin?: LinkedinConfig;
    threads?: ThreadsConfig;
    bluesky?: BlueskyConfig;
    pinterest?: PinterestConfig;
  };
  account_configurations?: {    // Account-specific overrides
    account_configurations: [{
      account_id: number;
      caption?: string;
      media?: string[];
    }]
  };
  is_draft?: boolean;           // Save but don't process
  processing_enabled?: boolean; // Default true - transcode videos
}
```

**Post Status Enum:**
- `scheduled` - Waiting for scheduled time
- `processing` - Currently being published
- `posted` - Successfully published

---

## Platform-Specific Configurations

### Instagram
```typescript
{
  caption?: string;                    // Override post caption
  media?: string[];                    // Override media
  video_cover_timestamp_ms?: number;   // Thumbnail selection
  placement?: string;                  // "reels" | "feed"
}
```

### TikTok
```typescript
{
  caption?: string;
  media?: string[];
  title?: string;
  video_cover_timestamp_ms?: number;
  draft?: boolean;                     // Save as draft, don't publish
  is_aigc?: boolean;                   // AI-generated content label
}
```

### YouTube
```typescript
{
  caption?: string;        // Description
  media?: string[];
  title?: string;          // Video title (required for YT)
}
```

### Facebook
```typescript
{
  caption?: string;
  media?: string[];
  placement?: string;      // Feed vs Reels
}
```

### Pinterest
```typescript
{
  caption?: string;
  media?: string[];
  board_ids?: string[];              // Which boards to pin to
  link?: string;                     // Destination URL
  video_cover_timestamp_ms?: number;
  title?: string;
}
```

### Threads
```typescript
{
  caption?: string;
  media?: string[];
  location?: "reels" | "timeline";
}
```

### Twitter/X, LinkedIn, Bluesky
```typescript
{
  caption?: string;
  media?: string[];
}
```

---

## Social Accounts

```
GET /v1/social-accounts           → List connected accounts
GET /v1/social-accounts/{id}      → Get account details
```

**SocialAccountDto:**
```typescript
{
  id: number;          // Use this when creating posts
  platform: string;    // "instagram", "facebook", etc.
  username: string;    // @handle on the platform
}
```

---

## Post Results (Outcomes)

```
GET /v1/post-results           → List all results
GET /v1/post-results/{id}      → Get specific result
```

**PostResultDto:**
```typescript
{
  id: string;
  post_id: string;
  success: boolean;
  social_account_id: number;
  error?: {
    message?: string;
    code?: string;
  };
  platform_data: {
    id: string;        // Platform's post ID
    url: string;       // URL to view the post
    username: string;
  }
}
```

---

## OAuth Flow (Instagram)

### Instagram Connection Options

**Option 1: Direct Instagram Login**
- Uses Instagram Graph API directly
- Scopes: `instagram_business_basic`, `instagram_business_content_publish`
- Requires Business/Creator account

**Option 2: Facebook-Linked**
- Uses Meta Graph API
- Instagram must be linked to Facebook Page
- More permissions, better for pages

### OAuth URL Structure
```
https://www.instagram.com/oauth/authorize/third_party/
  ?client_id={APP_ID}
  &redirect_uri={CALLBACK_URL}
  &response_type=code
  &scope=instagram_business_basic,instagram_business_content_publish
  &force_reauth=0
```

### Callback Flow
```
POST-BRIDGE CALLBACK: /api/instagram-auth/instagram-login/callback

1. Receive authorization code
2. Exchange for access token
3. Store refresh token (encrypted)
4. Create SocialAccount record
5. Redirect to dashboard
```

---

## Inferred Backend Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        POST-BRIDGE BACKEND                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │   API Gateway    │  │  Auth Service    │  │  Media Service   │  │
│  │   (NestJS)       │  │  (OAuth flows)   │  │  (Presigned URL) │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                     │            │
│  ┌────────┴─────────────────────┴─────────────────────┴─────────┐  │
│  │                       PostgreSQL                              │  │
│  │  - users, workspaces, api_keys                               │  │
│  │  - social_accounts (tokens encrypted)                        │  │
│  │  - media (temporary records)                                 │  │
│  │  - posts, post_results                                       │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  S3/GCS Storage  │  │  Job Queue       │  │  Video Processor │  │
│  │  (Media files)   │  │  (BullMQ/Redis)  │  │  (FFmpeg/Cloud)  │  │
│  └──────────────────┘  └────────┬─────────┘  └──────────────────┘  │
│                                 │                                   │
│  ┌──────────────────────────────┴───────────────────────────────┐  │
│  │                    Platform Workers                           │  │
│  │  - InstagramWorker (Graph API)                               │  │
│  │  - FacebookWorker (Graph API)                                │  │
│  │  - YouTubeWorker (Data API v3)                               │  │
│  │  - TikTokWorker (Content Posting API)                        │  │
│  │  - TwitterWorker (API v2)                                    │  │
│  │  - LinkedInWorker (Marketing API)                            │  │
│  │  - PinterestWorker (API v5)                                  │  │
│  │  - ThreadsWorker (Graph API)                                 │  │
│  │  - BlueskyWorker (AT Protocol)                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Insights

### 1. Presigned URLs for Media Upload
- Offloads upload bandwidth to cloud storage
- Client uploads directly to S3/GCS
- Server only handles metadata

### 2. Processing Flag
```typescript
processing_enabled?: boolean; // Default true
```
When true, they transcode videos to meet platform requirements. This is the key feature that makes it "just work."

### 3. Three-Level Content Override
```
Default Caption → Platform Override → Account Override
```
Most specific wins. Allows posting same content with platform-specific tweaks.

### 4. Async Publishing with Results
- POST /posts returns immediately with status "processing"
- Background worker handles actual publish
- Results stored in post_results table
- Client polls or uses webhooks for status

### 5. Video Cover Timestamp
```typescript
video_cover_timestamp_ms?: number;
```
Allows selecting thumbnail frame without re-uploading. Smart optimization.

---

## Pricing Model Insights

| Plan | Price | Features |
|------|-------|----------|
| Creator | $29/mo | 15 accounts, unlimited posts |
| Pro | $49/mo | Unlimited accounts, team features |
| API Add-on | +$?/mo | Programmatic access |

**Revenue model:** Platform subscription + API upsell

---

## Self-Hosted Recreation Estimate

### Using Our Stack

| Component | Our Implementation |
|-----------|-------------------|
| API Gateway | Netlify Functions (existing) |
| Database | Supabase PostgreSQL (existing) |
| Storage | Supabase Storage (existing) |
| Job Queue | Netlify Background Functions |
| Video Processing | Railway transcoder (existing) |
| OAuth | Our Meta/YouTube flows (existing) |

### Missing Components

1. **Unified API layer** - Need to build
2. **Platform workers** - Have Meta/YouTube, need others
3. **Presigned URL flow** - Supabase supports this
4. **Post results tracking** - Need to add

### Effort Estimate

| Phase | Work | Time |
|-------|------|------|
| API Design | Unified endpoint structure | 4 hours |
| Media Service | Presigned URLs + cleanup | 4 hours |
| Post Service | Create/schedule/status | 8 hours |
| Platform Workers | Extend existing | 4 hours |
| Results Tracking | New table + polling | 4 hours |
| **Total** | | **~24 hours** |

---

## Next Steps

1. [ ] Complete Instagram connection to test full flow
2. [ ] Test video posting via their API (if we get API access)
3. [ ] Document platform-specific requirements
4. [ ] Design self-hosted API schema
5. [ ] Implement MVP with Instagram + YouTube

---

*Analysis created: 2026-01-23*
