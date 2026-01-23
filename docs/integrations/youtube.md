# YouTube Integration

## Overview
Post videos to YouTube (including Shorts) using the YouTube Data API v3.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Any Google account |
| Channel | Must have a YouTube channel created |
| Verification | Verified accounts can upload longer videos |

### Creating a YouTube Channel
1. Sign in to YouTube with Google account
2. Click profile icon → Create a channel
3. Follow setup wizard

---

## Video Specifications

### Regular Videos
| Spec | Value |
|------|-------|
| **Format** | MP4, MOV, AVI, WMV, FLV, 3GP, WebM |
| **Duration** | Up to 12 hours (verified), 15 min (unverified) |
| **Max Size** | 256GB |
| **Aspect Ratio** | 16:9 recommended (any supported) |
| **Resolution** | Up to 8K (7680x4320) |
| **Frame Rate** | 24-60 fps |
| **Video Codec** | H.264 recommended |
| **Audio Codec** | AAC-LC recommended |

### YouTube Shorts
| Spec | Value |
|------|-------|
| **Duration** | ≤60 seconds |
| **Aspect Ratio** | 9:16 (vertical) |
| **Resolution** | 1080x1920 recommended |

### ⚠️ Important Notes
- **Shorts are auto-detected** by duration (≤60s) and aspect ratio (9:16)
- **Title is REQUIRED** (unlike other platforms)
- Use **resumable uploads** for large files
- Processing can take **5-30 minutes** for HD content

---

## Authentication

### OAuth Scopes Required
```
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube
```

### OAuth Flow
1. User clicks "Connect YouTube"
2. Redirect to Google OAuth consent screen
3. User selects Google account and approves
4. Callback receives authorization code
5. Exchange code for access + refresh tokens
6. Store encrypted tokens

### Token Refresh
- Access tokens expire after 1 hour
- Refresh tokens are long-lived
- Must refresh frequently

---

## API Flow

### Step 1: Initialize Resumable Upload
```http
POST https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "snippet": {
    "title": "Video Title",
    "description": "Video description with #hashtags",
    "tags": ["tag1", "tag2"],
    "categoryId": "22"
  },
  "status": {
    "privacyStatus": "public",
    "selfDeclaredMadeForKids": false
  }
}
```

**Response Header:**
```
Location: https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=xxx
```

### Step 2: Upload Video in Chunks
```http
PUT {upload_url}
Content-Type: video/mp4
Content-Length: 50000000
Content-Range: bytes 0-49999999/50000000

{binary video data}
```

### Step 3: Monitor Processing
```http
GET https://www.googleapis.com/youtube/v3/videos?id={video_id}&part=processingDetails,status
Authorization: Bearer {access_token}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Title** | Video title (required) | `snippet.title` |
| **Description** | Video description | `snippet.description` |
| **Tags** | Search tags | `snippet.tags` |
| **Category** | Content category | `snippet.categoryId` |
| **Privacy** | public/private/unlisted | `status.privacyStatus` |
| **Made for Kids** | COPPA compliance | `status.selfDeclaredMadeForKids` |
| **Scheduled** | Publish at specific time | `status.publishAt` |

### Privacy Options
- `public` - Anyone can view
- `unlisted` - Only with link
- `private` - Only you

### Common Category IDs
- `22` - People & Blogs
- `24` - Entertainment
- `26` - How-to & Style
- `28` - Science & Technology

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Uploads per day | ~100 (quota-based) |
| API quota | 10,000 units/day default |
| Upload cost | 1,600 units per upload |

---

## Error Handling

| Error | Meaning | Solution |
|-------|---------|----------|
| `quotaExceeded` | Daily quota reached | Wait 24h or request increase |
| `uploadLimitExceeded` | Too many uploads | Wait and retry |
| `videoTooLong` | Exceeds duration limit | Verify account or trim video |
| `invalidMetadata` | Bad title/description | Check for invalid characters |

---

## YouTube Shorts Detection

YouTube automatically categorizes as Shorts when:
1. Duration is **60 seconds or less**
2. Aspect ratio is **9:16 (vertical)**

No special API flag needed - just upload a short vertical video.

```json
{
  "snippet": {
    "title": "My Short #Shorts"
  }
}
```

Adding `#Shorts` to title or description can help discoverability.

---

## Resumable Upload Benefits

For files over 5MB, always use resumable uploads:
- **Resume interrupted uploads** - don't restart from scratch
- **Better reliability** - handles network issues
- **Progress tracking** - know exactly how much uploaded

---

## Best Practices

1. **Always include a title** - it's required
2. **Use resumable uploads** for reliability
3. **Add relevant tags** for discoverability
4. **Set correct category** for recommendations
5. **Handle COPPA** - set `selfDeclaredMadeForKids` correctly
6. **Use unlisted** for testing before going public
7. **Add #Shorts** tag for short vertical videos

---

*Last updated: 2026-01-23*
