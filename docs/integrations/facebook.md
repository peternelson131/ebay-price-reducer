# Facebook Integration

## Overview
Post videos to Facebook Pages (including Reels) using the Meta Graph API.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | **Facebook Page** (NOT personal profile) |
| Page Role | Must be Page Admin |
| API Access | Via Meta Developer App |

### ⚠️ Critical: Pages Only
**Personal profiles are NOT supported** for API posting. You must have a Facebook Page.

### Creating a Facebook Page
1. Go to facebook.com/pages/create
2. Choose Page type (Business, Brand, etc.)
3. Fill in Page details
4. Publish the Page

---

## Video Specifications

### Feed Videos
| Spec | Value |
|------|-------|
| **Format** | MP4 (H.264) recommended, MOV |
| **Duration** | Up to 240 minutes |
| **Max Size** | 10GB |
| **Aspect Ratio** | 16:9, 9:16, 1:1 |
| **Resolution** | 1280x720 minimum |
| **Frame Rate** | 30 fps recommended |
| **Audio** | AAC, 128kbps+ |

### Facebook Reels
| Spec | Value |
|------|-------|
| **Duration** | 3-90 seconds |
| **Aspect Ratio** | 9:16 (vertical) required |
| **Resolution** | 1080x1920 recommended |

### ⚠️ Important Notes
- Use **chunked upload** for files over 1GB
- Reels require **9:16 vertical** aspect ratio
- Page access tokens required (not user tokens)

---

## Authentication

### OAuth Scopes Required
```
pages_show_list
pages_read_engagement
pages_manage_posts
publish_video
business_management
```

### OAuth Flow
1. User clicks "Connect Facebook"
2. Redirect to Facebook OAuth consent screen
3. User logs in and selects Pages to grant access
4. Callback receives authorization code
5. Exchange for **Page Access Token**
6. Store encrypted tokens

### Page Access Tokens
1. Get User Access Token from OAuth
2. Call `/me/accounts` to list Pages
3. Extract Page Access Token for each Page
4. Use Page token for posting

```http
GET /me/accounts?access_token={user_token}
```

---

## API Flow

### Simple Upload (< 1GB)
```http
POST https://graph.facebook.com/v18.0/{page-id}/videos
Authorization: Bearer {page_access_token}
Content-Type: multipart/form-data

file_url=https://example.com/video.mp4
description=Video caption here
```

### Chunked Upload (> 1GB)

#### Step 1: Start Upload
```http
POST https://graph.facebook.com/v18.0/{page-id}/videos
Authorization: Bearer {page_access_token}

upload_phase=start
file_size=5000000000
```

#### Step 2: Upload Chunks
```http
POST https://graph.facebook.com/v18.0/{page-id}/videos
Authorization: Bearer {page_access_token}

upload_phase=transfer
upload_session_id={session_id}
start_offset=0
video_file_chunk={binary}
```

#### Step 3: Finish Upload
```http
POST https://graph.facebook.com/v18.0/{page-id}/videos
Authorization: Bearer {page_access_token}

upload_phase=finish
upload_session_id={session_id}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Description** | Post caption | `description` |
| **Title** | Video title | `title` |
| **Scheduled** | Publish later | `scheduled_publish_time` |
| **Unpublished** | Upload without posting | `published=false` |
| **Reels** | Post as Reel | Use Reels API endpoint |

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Posts per day | ~50 per Page |
| Posts per hour | ~25 per Page |
| API calls | 200 calls/hour per user |

---

## Error Handling

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `OAuthException` | Token expired/invalid | Refresh token |
| `(#100)` | Invalid parameter | Check request format |
| `(#200)` | Permission denied | Check Page permissions |
| `(#368)` | Blocked for policy | Review content policies |

---

## Posting to Reels

Use the Reels-specific endpoint:

```http
POST https://graph.facebook.com/v18.0/{page-id}/video_reels

video_url=https://example.com/vertical-video.mp4
description=Reel caption #hashtag
```

Requirements:
- Video must be 9:16 vertical
- Duration 3-90 seconds
- H.264 codec

---

## Best Practices

1. **Always use Page Access Tokens** - user tokens won't work
2. **Use chunked upload** for large files (>1GB)
3. **Verify Page permissions** before posting
4. **Use 9:16 for Reels** - required aspect ratio
5. **Handle token refresh** proactively
6. **Test with unpublished=true** first

---

*Last updated: 2026-01-23*
