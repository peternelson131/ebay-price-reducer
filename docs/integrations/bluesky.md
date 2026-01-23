# Bluesky Integration

## Overview
Post videos to Bluesky using the AT Protocol.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Any Bluesky account |
| Auth Method | App Password (recommended) |

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4 |
| **Duration** | Up to 60 seconds |
| **Max Size** | 50MB |
| **Aspect Ratio** | Any |
| **Video Codec** | H.264 |

### ⚠️ Important Notes
- **Smallest limits** of all platforms (50MB, 60s)
- **Simplest API** - AT Protocol is open
- Self-hosted option available

---

## Authentication

### App Password Method
1. Go to Bluesky Settings → App Passwords
2. Create new app password
3. Use with identifier (handle or DID)

```javascript
{
  identifier: "user.bsky.social",
  password: "xxxx-xxxx-xxxx-xxxx"
}
```

---

## API Flow

### Step 1: Create Session
```http
POST https://bsky.social/xrpc/com.atproto.server.createSession
Content-Type: application/json

{
  "identifier": "user.bsky.social",
  "password": "app-password"
}
```

### Step 2: Upload Video Blob
```http
POST https://bsky.social/xrpc/com.atproto.repo.uploadBlob
Authorization: Bearer {accessJwt}
Content-Type: video/mp4

{binary video data}
```

### Step 3: Create Post
```http
POST https://bsky.social/xrpc/com.atproto.repo.createRecord
Authorization: Bearer {accessJwt}
Content-Type: application/json

{
  "repo": "did:plc:xxx",
  "collection": "app.bsky.feed.post",
  "record": {
    "text": "Post text here",
    "createdAt": "2026-01-23T00:00:00.000Z",
    "embed": {
      "$type": "app.bsky.embed.video",
      "video": {
        "$type": "blob",
        "ref": { "$link": "bafkrei..." },
        "mimeType": "video/mp4",
        "size": 5000000
      }
    }
  }
}
```

---

## Best Practices

1. **Keep videos small** - 50MB limit
2. **Keep videos short** - 60 second limit  
3. **Use app passwords** - don't use main password
4. **Simple API** - great for testing

---

*Last updated: 2026-01-23*
