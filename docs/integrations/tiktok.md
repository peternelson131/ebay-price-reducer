# TikTok Integration

## Overview
Post videos to TikTok using the TikTok Content Posting API.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | **Business** or **Creator** profile |
| Account Age | Must be older than **48 hours** |
| API Access | Requires TikTok Developer App approval |
| Warm Up | New accounts should "warm up" before posting |

### How to Switch to Business Account
1. Go to TikTok Settings → Manage Account
2. Select "Switch to Business Account"
3. Choose your business category

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4, MOV, WebM |
| **Duration** | 1 second - 10 minutes |
| **Max Size** | 4GB (web), 287MB (mobile) |
| **Aspect Ratio** | 9:16 (vertical) required |
| **Resolution** | 720x1280 min, 1080x1920 recommended |
| **Frame Rate** | 24-60 fps |
| **Video Codec** | H.264, HEVC |
| **Audio Codec** | AAC |
| **Bitrate** | 516 kbps - 20 Mbps |

### ⚠️ Important Notes
- Videos **must be vertical (9:16)** for best performance
- New accounts need a "warm up" period before API posting
- Can save as **draft** first for review before publishing

---

## Authentication

### OAuth Scopes Required
```
user.info.basic
video.list
video.upload
video.publish
```

### OAuth Flow
1. User clicks "Connect TikTok"
2. Redirect to TikTok OAuth consent screen
3. User logs in and approves permissions
4. Callback receives authorization code
5. Exchange code for access token
6. Store encrypted tokens

### Token Refresh
- Access tokens expire after 24 hours
- Refresh tokens expire after 365 days
- Must refresh proactively

---

## API Flow

### Step 1: Initialize Video Upload
```http
POST https://open.tiktokapis.com/v2/post/publish/inbox/video/init/
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "source_info": {
    "source": "FILE_UPLOAD",
    "video_size": 50000000,
    "chunk_size": 10000000,
    "total_chunk_count": 5
  }
}
```

**Response:**
```json
{
  "data": {
    "publish_id": "v_pub_xxx",
    "upload_url": "https://..."
  }
}
```

### Step 2: Upload Video Chunks
```http
PUT {upload_url}
Content-Type: video/mp4
Content-Range: bytes 0-9999999/50000000

{binary video data}
```

### Step 3: Publish Video
```http
POST https://open.tiktokapis.com/v2/post/publish/video/init/
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "post_info": {
    "title": "Video title",
    "privacy_level": "PUBLIC_TO_EVERYONE",
    "disable_duet": false,
    "disable_stitch": false,
    "disable_comment": false,
    "video_cover_timestamp_ms": 1000
  },
  "source_info": {
    "source": "PULL_FROM_URL",
    "video_url": "https://example.com/video.mp4"
  }
}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Title** | Video title/caption | `title` |
| **Privacy** | Who can view | `privacy_level` |
| **Thumbnail** | Cover frame selection | `video_cover_timestamp_ms` |
| **Draft Mode** | Save without publishing | `draft` |
| **AI Content** | Label as AI-generated | `is_aigc` |
| **Disable Duet** | Prevent duets | `disable_duet` |
| **Disable Stitch** | Prevent stitches | `disable_stitch` |
| **Disable Comments** | Turn off comments | `disable_comment` |

### Privacy Levels
- `PUBLIC_TO_EVERYONE` - Anyone can view
- `MUTUAL_FOLLOW_FRIENDS` - Mutual followers only
- `SELF_ONLY` - Private/draft

---

## Rate Limits

| Limit | Value |
|-------|-------|
| API calls/day | Varies by approval tier |
| Video uploads | Depends on account standing |

---

## Error Handling

| Error | Meaning | Solution |
|-------|---------|----------|
| `spam_risk_too_many_posts` | Posting too fast | Wait and retry |
| `spam_risk_user_banned_from_posting` | Account flagged | Contact TikTok support |
| `video_format_check_failed` | Invalid video | Check format/codec |
| `duration_check_failed` | Video too long/short | Adjust duration |

---

## AI-Generated Content Disclosure

If your video contains AI-generated content, you **must** set the `is_aigc` flag:

```json
{
  "post_info": {
    "is_aigc": true
  }
}
```

This adds TikTok's AI disclosure label to the video.

---

## Best Practices

1. **Always use 9:16 vertical video** - horizontal videos perform poorly
2. **"Warm up" new accounts** - post manually a few times first
3. **Use draft mode** for testing before going live
4. **Set appropriate privacy** during testing
5. **Label AI content** to avoid policy violations
6. **Keep titles engaging** - they appear on the For You page

---

*Last updated: 2026-01-23*
