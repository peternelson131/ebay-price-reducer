# Threads Integration

## Overview
Post videos to Threads using the Threads Graph API (via Meta).

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Must have Instagram Business/Creator account |
| Threads Account | Must have Threads profile created |
| API Access | Via Meta Developer App |

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4 (H.264) |
| **Duration** | Up to 5 minutes |
| **Max Size** | 1GB |
| **Aspect Ratio** | 9:16, 1:1 |
| **Resolution** | 1080x1920 recommended |
| **Frame Rate** | 24-60 fps |
| **Audio** | AAC |

---

## Authentication

### OAuth Scopes
```
threads_basic
threads_content_publish
```

---

## API Flow (Similar to Instagram)

### Step 1: Create Container
```http
POST https://graph.threads.net/v1.0/{user-id}/threads
Authorization: Bearer {access_token}

media_type=VIDEO
video_url=https://example.com/video.mp4
text=Post caption here
```

### Step 2: Poll Status
```http
GET https://graph.threads.net/v1.0/{container-id}?fields=status
```

### Step 3: Publish
```http
POST https://graph.threads.net/v1.0/{user-id}/threads_publish

creation_id={container_id}
```

---

## Rate Limits

- 500 posts per 24 hours
- ~50 posts per hour

---

## Best Practices

1. **Very similar to Instagram API** - same flow
2. **Async publishing** - poll for completion
3. **Use vertical video** for best engagement

---

*Last updated: 2026-01-23*
