# Pinterest Integration

## Overview
Post video Pins to Pinterest boards using the Pinterest API v5.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Business account recommended |
| Boards | Must have at least one board |
| API Access | Pinterest Developer App |

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4, MOV, M4V |
| **Duration** | 4 seconds - 15 minutes |
| **Max Size** | 2GB |
| **Aspect Ratio** | 9:16, 1:1, 2:3 |
| **Resolution** | 240p minimum |
| **Frame Rate** | 25 fps minimum |
| **Video Codec** | H.264 |
| **Audio Codec** | AAC |

---

## Authentication

### OAuth Scopes
```
boards:read
pins:read
pins:write
```

### Token Refresh
- Access tokens expire after 1 day
- Refresh tokens expire after 1 year

---

## API Flow

### Step 1: Create Media Upload
```http
POST https://api.pinterest.com/v5/media
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "media_type": "video"
}
```

### Step 2: Upload to Signed URL
```http
PUT {upload_url}
Content-Type: video/mp4

{binary video data}
```

### Step 3: Create Pin
```http
POST https://api.pinterest.com/v5/pins
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "board_id": "123456789",
  "title": "Pin Title",
  "description": "Pin description",
  "link": "https://example.com",
  "media_source": {
    "source_type": "video_id",
    "media_id": "{media_id}",
    "cover_image_timestamp_ms": 5000
  }
}
```

---

## Platform-Specific Options

| Option | Description | Required |
|--------|-------------|----------|
| **board_id** | Target board | Yes |
| **title** | Pin title | No |
| **description** | Pin description | No |
| **link** | Destination URL | Recommended |
| **cover_image_timestamp_ms** | Thumbnail frame | No |

---

## Best Practices

1. **Always specify a board** - required for pins
2. **Include destination link** - drives traffic
3. **Use 2:3 or 9:16** - optimal for Pinterest feed
4. **Set custom thumbnail** with timestamp

---

*Last updated: 2026-01-23*
