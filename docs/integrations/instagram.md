# Instagram Integration

## Overview
Post videos to Instagram Reels and Feed using the Instagram Graph API via Meta.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | **Business** or **Creator** profile |
| Facebook Link | Must be linked to a Facebook Page |
| API Access | Via Meta Developer App |

### How to Convert to Business Account
1. Go to Instagram Settings → Account
2. Select "Switch to Professional Account"
3. Choose "Business" or "Creator"
4. Connect to a Facebook Page (or create one)

---

## Video Specifications

| Spec | Reels | Feed Video |
|------|-------|------------|
| **Format** | MP4 (H.264) | MP4 (H.264) |
| **Duration** | 3-90 seconds | 3-60 seconds |
| **Max Size** | 100MB | 100MB |
| **Aspect Ratio** | 9:16 (vertical) | 1:1, 4:5, 16:9 |
| **Resolution** | 1080x1920 recommended | 1080x1080 or 1080x1350 |
| **Frame Rate** | 23-60 fps (30 recommended) | 23-60 fps |
| **Audio** | AAC, 128kbps+ | AAC, 128kbps+ |
| **Bitrate** | 3,500-5,000 kbps | 3,500-5,000 kbps |

### ⚠️ Important Notes
- **MOV files are NOT accepted** - must be transcoded to MP4
- Videos must be publicly accessible URL OR uploaded via resumable upload
- Publishing is **asynchronous** - can take 30 seconds to 5 minutes

---

## Authentication

### OAuth Scopes Required
```
instagram_business_basic
instagram_business_content_publish
```

### OAuth Flow
1. User clicks "Connect Instagram"
2. Redirect to Instagram OAuth consent screen
3. User approves permissions
4. Callback receives authorization code
5. Exchange code for access token
6. Store encrypted refresh token

### Token Refresh
- Access tokens expire after ~60 days
- Use refresh token to get new access token
- Refresh tokens are long-lived

---

## API Flow

### Step 1: Create Media Container
```http
POST https://graph.instagram.com/v18.0/{ig-user-id}/media
Content-Type: application/json

{
  "video_url": "https://example.com/video.mp4",
  "caption": "Your caption here #hashtag",
  "media_type": "REELS"
}
```

**Response:**
```json
{
  "id": "17889455560051444"
}
```

### Step 2: Check Upload Status
```http
GET https://graph.instagram.com/v18.0/{creation-id}?fields=status_code
```

**Poll until:**
```json
{
  "status_code": "FINISHED"
}
```

### Step 3: Publish Media
```http
POST https://graph.instagram.com/v18.0/{ig-user-id}/media_publish
Content-Type: application/json

{
  "creation_id": "17889455560051444"
}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Caption** | Post text (max 2,200 chars) | `caption` |
| **Thumbnail** | Select frame for cover | `video_cover_timestamp_ms` |
| **Location** | Tag a location | `location_id` |
| **Placement** | Reels vs Feed | `media_type` |

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Posts per day | ~25 |
| Posts per hour | ~10 |
| API calls | 200/hour per user |

---

## Error Handling

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `EXPIRED` | Token expired | Refresh access token |
| `PUBLISHED` | Already published | Skip - already done |
| `ERROR` | Processing failed | Check video format/size |
| `IN_PROGRESS` | Still processing | Wait and poll again |

---

## Thumbnail Selection

Use `video_cover_timestamp_ms` to select the thumbnail frame:

```json
{
  "video_cover_timestamp_ms": 5000
}
```

- Value is in milliseconds from start
- Range: 0 to video duration
- Default: First frame if not specified

---

## Best Practices

1. **Always transcode to H.264/AAC** before uploading
2. **Use 9:16 aspect ratio** for Reels (best engagement)
3. **Keep videos under 60 seconds** for broader compatibility
4. **Include hashtags** in caption for discoverability
5. **Poll status** every 5 seconds until FINISHED
6. **Handle async failures** - publishing can fail after upload succeeds

---

*Last updated: 2026-01-23*
