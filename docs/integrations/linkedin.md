# LinkedIn Integration

## Overview
Post videos to LinkedIn personal profiles and Company Pages using the LinkedIn Marketing API.

---

## Account Requirements

| Requirement | Details |
|-------------|---------|
| Account Type | Any LinkedIn account |
| Company Pages | Admin access required for company posting |
| API Access | LinkedIn Developer App |

---

## Video Specifications

| Spec | Value |
|------|-------|
| **Format** | MP4 |
| **Duration** | 3 seconds - 10 minutes |
| **Max Size** | 5GB |
| **Aspect Ratio** | 16:9, 1:1, 9:16 |
| **Resolution** | 256x144 to 4096x2304 |
| **Frame Rate** | 30 fps recommended |
| **Video Codec** | H.264 |
| **Audio Codec** | AAC |
| **Bitrate** | 192 kbps - 30 Mbps |

### ⚠️ Important Notes
- Video must be **registered as asset** first
- Processing can take **several minutes**
- Organization posts require **different permissions**

---

## Authentication

### OAuth Scopes Required
```
w_member_social     (for personal posts)
w_organization_social (for company posts)
r_liteprofile
```

### OAuth Flow
1. User clicks "Connect LinkedIn"
2. Redirect to LinkedIn OAuth consent screen
3. User approves permissions
4. Callback receives authorization code
5. Exchange for access token
6. Store encrypted token

### Token Refresh
- Access tokens expire after 2 months
- Refresh tokens expire after 1 year
- Must implement refresh flow

---

## API Flow

### Step 1: Register Upload
```http
POST https://api.linkedin.com/v2/assets?action=registerUpload
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "registerUploadRequest": {
    "recipes": ["urn:li:digitalmediaRecipe:feedshare-video"],
    "owner": "urn:li:person:{person_id}",
    "serviceRelationships": [{
      "relationshipType": "OWNER",
      "identifier": "urn:li:userGeneratedContent"
    }]
  }
}
```

**Response:**
```json
{
  "value": {
    "uploadMechanism": {
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest": {
        "uploadUrl": "https://api.linkedin.com/mediaUpload/..."
      }
    },
    "asset": "urn:li:digitalmediaAsset:xxx"
  }
}
```

### Step 2: Upload Video
```http
PUT {uploadUrl}
Authorization: Bearer {access_token}
Content-Type: application/octet-stream

{binary video data}
```

### Step 3: Check Asset Status
```http
GET https://api.linkedin.com/v2/assets/{asset_id}
Authorization: Bearer {access_token}
```

Poll until `status.status` is `AVAILABLE`.

### Step 4: Create Post
```http
POST https://api.linkedin.com/v2/ugcPosts
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "author": "urn:li:person:{person_id}",
  "lifecycleState": "PUBLISHED",
  "specificContent": {
    "com.linkedin.ugc.ShareContent": {
      "shareCommentary": {
        "text": "Post text here"
      },
      "shareMediaCategory": "VIDEO",
      "media": [{
        "status": "READY",
        "media": "urn:li:digitalmediaAsset:xxx",
        "title": {
          "text": "Video Title"
        }
      }]
    }
  },
  "visibility": {
    "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
  }
}
```

---

## Platform-Specific Options

| Option | Description | API Field |
|--------|-------------|-----------|
| **Text** | Post commentary | `shareCommentary.text` |
| **Title** | Video title | `media[].title.text` |
| **Visibility** | Who can see | `visibility` |
| **Author** | Person or Company | `author` |

### Visibility Options
- `PUBLIC` - Anyone on LinkedIn
- `CONNECTIONS` - 1st degree only

---

## Rate Limits

| Limit | Value |
|-------|-------|
| Posts per day | 150 per member |
| API calls | 100,000 per day |
| Posts per hour | ~50 |

---

## Error Handling

| Error Code | Meaning | Solution |
|------------|---------|----------|
| `401` | Unauthorized | Refresh access token |
| `403` | Forbidden | Check permissions |
| `422` | Invalid request | Validate request body |
| `429` | Rate limited | Back off and retry |

---

## Company Page Posting

For organization posts, use organization URN as author:

```json
{
  "author": "urn:li:organization:{org_id}",
  "specificContent": { ... }
}
```

Requires `w_organization_social` scope.

---

## Best Practices

1. **Register video as asset first** - required step
2. **Wait for AVAILABLE status** before posting
3. **Use correct author URN** for person vs company
4. **Handle token refresh** - tokens expire frequently
5. **Set appropriate visibility** for your audience
6. **Include compelling text** - LinkedIn is professional

---

*Last updated: 2026-01-23*
