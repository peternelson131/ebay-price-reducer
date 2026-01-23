# Twitter/X Integration

## Overview
Post videos to Twitter (X) using the Twitter API v2.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Any Twitter account |
| API Access | Twitter Developer account (Basic tier+) |
| App Approval | OAuth 2.0 app required |

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4 only |
| **Duration** | Up to 2 minutes 20 seconds (140 seconds) |
| **Max Size** | 512MB |
| **Aspect Ratio** | 16:9, 1:1 recommended |
| **Resolution** | 1920x1200 or 1200x1920 max |
| **Frame Rate** | 30-60 fps |
| **Video Codec** | H.264 High Profile |
| **Audio Codec** | AAC Low Complexity |
| **Bitrate** | 25 Mbps max |

### ⚠️ Important Notes
- **Strict 2:20 duration limit** - longer videos will fail
- Must **wait for processing** before tweeting
- **Chunked upload required** (5MB chunks)

---

## Authentication

### OAuth Scopes Required
```
tweet.read
tweet.write
users.read
media.upload (for media)
```

### OAuth 2.0 Flow
1. User clicks "Connect Twitter"
2. Redirect to Twitter OAuth consent screen
3. User approves permissions
4. Callback receives authorization code
5. Exchange for access + refresh tokens
6. Store encrypted tokens

### Token Refresh
- Access tokens expire after 2 hours
- Refresh tokens expire after 6 months
- Must refresh frequently

---

## API Flow

### Step 1: Initialize Upload
```http
POST https://upload.twitter.com/1.1/media/upload.json
Authorization: OAuth ...

command=INIT
total_bytes=5000000
media_type=video/mp4
media_category=tweet_video
```

**Response:**
```json
{
  "media_id": 1234567890,
  "media_id_string": "1234567890"
}
```

### Step 2: Upload Chunks (5MB each)
```http
POST https://upload.twitter.com/1.1/media/upload.json
Authorization: OAuth ...
Content-Type: multipart/form-data

command=APPEND
media_id=1234567890
segment_index=0
media={binary chunk}
```

### Step 3: Finalize Upload
```http
POST https://upload.twitter.com/1.1/media/upload.json
Authorization: OAuth ...

command=FINALIZE
media_id=1234567890
```

### Step 4: Check Processing Status
```http
GET https://upload.twitter.com/1.1/media/upload.json
Authorization: OAuth ...

command=STATUS
media_id=1234567890
```

**Poll until:**
```json
{
  "processing_info": {
    "state": "succeeded"
  }
}
```

### Step 5: Create Tweet
```http
POST https://api.twitter.com/2/tweets
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "text": "Tweet text here",
  "media": {
    "media_ids": ["1234567890"]
  }
}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Text** | Tweet text (max 280 chars) | `text` |
| **Reply** | Reply to another tweet | `reply.in_reply_to_tweet_id` |
| **Quote** | Quote tweet | `quote_tweet_id` |
| **Poll** | Add poll (no video) | `poll` |

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Tweets per 3 hours | 300 |
| Tweets per 24 hours | 2,400 |
| Media uploads | 615 chunks/15 min |

---

## Error Handling

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `324` | Media not found | Wait for processing |
| `186` | Tweet too long | Reduce text length |
| `187` | Duplicate tweet | Change tweet text |
| `453` | App suspended | Contact Twitter support |

### Processing States
- `pending` - Upload received, queued
- `in_progress` - Currently processing
- `succeeded` - Ready to tweet
- `failed` - Processing failed (check error)

---

## Chunked Upload Details

Twitter requires chunked uploads for all videos:

```
Chunk size: 5MB (5242880 bytes)
Max chunks: depends on file size
Upload method: multipart/form-data
```

Example for 15MB video:
- Chunk 0: bytes 0-5242879
- Chunk 1: bytes 5242880-10485759
- Chunk 2: bytes 10485760-15000000

---

## Best Practices

1. **Always check processing status** before tweeting
2. **Use 5MB chunks** for reliable uploads
3. **Keep videos under 2:20** - strict limit
4. **Use H.264 High Profile** for best compatibility
5. **Handle rate limits** with exponential backoff
6. **Retry failed chunks** - don't restart entire upload

---

*Last updated: 2026-01-23*
