# Platform Integration Specification

**Date:** 2026-01-23  
**Purpose:** Comprehensive platform requirements for seamless social media video posting  
**Source:** Post-Bridge analysis + Official platform documentation

---

## Executive Summary

This document specifies the technical requirements for posting videos to 9 social media platforms. The key insight from Post-Bridge is that **server-side video processing** is essential for seamless posting - they accept MOV/MP4 and transcode to each platform's requirements automatically.

---

## Platform Matrix

| Platform | Video Formats | Max Duration | Max Size | Aspect Ratios | Auth Method |
|----------|---------------|--------------|----------|---------------|-------------|
| **Instagram** | MP4 (H.264) | 60s (Reels: 90s) | 100MB | 9:16, 1:1, 4:5 | Instagram Graph API |
| **TikTok** | MP4, MOV | 10 min | 4GB | 9:16 | TikTok Content Posting API |
| **YouTube** | MP4, MOV, AVI | 12 hours | 256GB | 16:9, 9:16 | YouTube Data API v3 |
| **Facebook** | MP4 (H.264) | 240 min | 10GB | 9:16, 16:9, 1:1 | Meta Graph API |
| **Twitter/X** | MP4 (H.264) | 2:20 | 512MB | 16:9, 1:1 | Twitter API v2 |
| **LinkedIn** | MP4 | 10 min | 5GB | 16:9, 1:1, 9:16 | LinkedIn Marketing API |
| **Pinterest** | MP4, MOV | 15 min | 2GB | 9:16, 1:1, 2:3 | Pinterest API v5 |
| **Threads** | MP4 (H.264) | 5 min | 1GB | 9:16, 1:1 | Threads Graph API |
| **Bluesky** | MP4 | 60s | 50MB | Any | AT Protocol |

---

## Detailed Platform Specifications

### 1. Instagram (Reels & Feed)

**API:** Instagram Graph API (via Meta)  
**Auth:** OAuth 2.0 with Facebook Business  

**Scopes Required:**
```
instagram_business_basic
instagram_business_content_publish
```

**Video Requirements:**
```yaml
Container: MP4 (MPEG-4 Part 14)
Video Codec: H.264
Audio Codec: AAC (128kbps+ recommended)
Frame Rate: 23-60 fps (30fps recommended)
Resolution: 
  - Reels: 1080x1920 (9:16) preferred
  - Feed: 1080x1080 (1:1) or 1080x1350 (4:5)
Bitrate: 3,500-5,000 kbps
Duration: 3-90 seconds (Reels), 3-60 seconds (Feed)
Max Size: 100MB
```

**Post-Bridge Configuration:**
```typescript
interface InstagramConfiguration {
  caption?: string;           // Override post caption (max 2200 chars)
  media?: string[];           // Override media IDs
  video_cover_timestamp_ms?: number;  // Thumbnail selection (0-90000ms)
  placement?: 'reels' | 'feed';       // Where to post
}
```

**API Flow:**
```
1. POST /me/media (create container)
   - video_url or media_id
   - caption
   - media_type: REELS or VIDEO
   
2. Poll GET /media/{id}?fields=status_code
   - Wait for status: FINISHED
   
3. POST /me/media_publish
   - creation_id from step 1
```

**Key Gotchas:**
- MOV not accepted - must transcode to MP4
- Videos must be publicly accessible URL or uploaded via resumable
- Publishing is async - can take 30s-5min
- Thumbnail can be selected via `video_cover_timestamp_ms`

---

### 2. TikTok

**API:** TikTok Content Posting API  
**Auth:** OAuth 2.0

**Scopes Required:**
```
video.upload
video.publish
```

**Video Requirements:**
```yaml
Container: MP4, MOV, WebM
Video Codec: H.264, HEVC
Audio Codec: AAC
Frame Rate: 24-60 fps
Resolution: 720x1280 minimum, 1080x1920 recommended
Bitrate: 516 kbps - 20 Mbps
Duration: 1 second - 10 minutes
Max Size: 4GB (Web), 287MB (Mobile)
```

**Post-Bridge Configuration:**
```typescript
interface TiktokConfiguration {
  caption?: string;
  media?: string[];
  title?: string;                      // Video title
  video_cover_timestamp_ms?: number;   // Thumbnail frame
  draft?: boolean;                     // Save as draft, don't publish
  is_aigc?: boolean;                   // AI-generated content label
}
```

**API Flow:**
```
1. POST /v2/post/publish/inbox/video/init/
   - source_info.source: FILE_UPLOAD
   - Returns upload_url
   
2. PUT upload_url with video binary
   
3. POST /v2/post/publish/video/init/
   - Or poll for completion
```

**Key Gotchas:**
- Requires TikTok for Developers app approval
- Videos must be vertical (9:16) for best performance
- `is_aigc` flag required if AI-generated
- Can post as draft first for review

---

### 3. YouTube (Shorts & Regular)

**API:** YouTube Data API v3  
**Auth:** OAuth 2.0

**Scopes Required:**
```
https://www.googleapis.com/auth/youtube.upload
https://www.googleapis.com/auth/youtube
```

**Video Requirements:**
```yaml
Container: MP4, MOV, AVI, WMV, FLV, 3GP, WebM
Video Codec: H.264 recommended
Audio Codec: AAC-LC recommended
Frame Rate: 24-60 fps
Resolution: 
  - Shorts: 1080x1920 (9:16), ≤60 seconds
  - Regular: Up to 8K (7680x4320)
Bitrate: Varies by resolution
Duration: Up to 12 hours (verified accounts)
Max Size: 256GB
```

**Post-Bridge Configuration:**
```typescript
interface YoutubeConfiguration {
  caption?: string;           // Video description
  media?: string[];
  title?: string;             // Video title (required)
}
```

**API Flow:**
```
1. POST /upload/youtube/v3/videos?uploadType=resumable
   - snippet: { title, description, tags, categoryId }
   - status: { privacyStatus, selfDeclaredMadeForKids }
   
2. PUT resumable upload URL with video chunks
   
3. Video processes async - poll for status
```

**Key Gotchas:**
- Shorts auto-detected by duration (≤60s) and aspect ratio (9:16)
- Resumable uploads required for large files
- Processing can take 5-30 minutes for HD
- Title is REQUIRED (unlike other platforms)

---

### 4. Facebook (Reels & Feed)

**API:** Meta Graph API  
**Auth:** OAuth 2.0

**Scopes Required:**
```
pages_show_list
pages_read_engagement
pages_manage_posts
publish_video
```

**Video Requirements:**
```yaml
Container: MP4 (recommended), MOV
Video Codec: H.264
Audio Codec: AAC (128kbps+)
Frame Rate: 30 fps recommended
Resolution: 1280x720 minimum
Bitrate: Variable
Duration: Up to 240 minutes
Max Size: 10GB
```

**Post-Bridge Configuration:**
```typescript
interface FacebookConfiguration {
  caption?: string;
  media?: string[];
  placement?: 'feed' | 'reels';  // Where to post
}
```

**API Flow:**
```
1. POST /{page-id}/videos
   - file_url or source (multipart)
   - description
   
2. Poll for upload_phase: finish
   
3. Video auto-publishes when ready
```

**Key Gotchas:**
- Reels require 9:16 aspect ratio
- Page access token required (not user token)
- Chunked upload for files > 1GB

---

### 5. Twitter/X

**API:** Twitter API v2  
**Auth:** OAuth 2.0 (or 1.0a)

**Scopes Required:**
```
tweet.read
tweet.write
users.read
media.upload
```

**Video Requirements:**
```yaml
Container: MP4
Video Codec: H.264 (High Profile)
Audio Codec: AAC (Low Complexity)
Frame Rate: 30-60 fps
Resolution: 1920x1200 or 1200x1920 max
Bitrate: 25 Mbps max
Duration: Up to 2:20 (140 seconds)
Max Size: 512MB
```

**Post-Bridge Configuration:**
```typescript
interface TwitterConfiguration {
  caption?: string;
  media?: string[];
}
```

**API Flow:**
```
1. POST /2/media/upload (INIT)
   - media_type, total_bytes, media_category: tweet_video
   
2. POST /2/media/upload (APPEND) - chunked
   
3. POST /2/media/upload (FINALIZE)
   
4. Poll GET /2/media/upload (STATUS) until succeeded
   
5. POST /2/tweets with media_ids
```

**Key Gotchas:**
- Strict 2:20 duration limit
- Must wait for video processing before tweeting
- Chunked upload required (5MB chunks)
- Rate limits: 300 tweets/3 hours

---

### 6. LinkedIn

**API:** LinkedIn Marketing API  
**Auth:** OAuth 2.0

**Scopes Required:**
```
w_member_social
```

**Video Requirements:**
```yaml
Container: MP4
Video Codec: H.264
Audio Codec: AAC
Frame Rate: 30 fps
Resolution: 256x144 to 4096x2304
Bitrate: 192 kbps - 30 Mbps
Duration: 3 seconds - 10 minutes
Max Size: 5GB
```

**Post-Bridge Configuration:**
```typescript
interface LinkedinConfiguration {
  caption?: string;
  media?: string[];
}
```

**API Flow:**
```
1. POST /v2/assets?action=registerUpload
   - Get uploadUrl
   
2. PUT uploadUrl with video binary
   
3. POST /v2/ugcPosts
   - author, lifecycleState, specificContent
```

**Key Gotchas:**
- Organization posts require different permissions
- Video must be registered as asset first
- Processing can take several minutes

---

### 7. Pinterest

**API:** Pinterest API v5  
**Auth:** OAuth 2.0

**Scopes Required:**
```
boards:read
pins:read
pins:write
```

**Video Requirements:**
```yaml
Container: MP4, MOV, M4V
Video Codec: H.264
Audio Codec: AAC
Frame Rate: 25 fps minimum
Resolution: 240p minimum
Duration: 4 seconds - 15 minutes
Max Size: 2GB
```

**Post-Bridge Configuration:**
```typescript
interface PinterestConfiguration {
  caption?: string;
  media?: string[];
  board_ids?: string[];              // Which boards to pin to
  link?: string;                     // Destination URL
  video_cover_timestamp_ms?: number; // Thumbnail frame
  title?: string;                    // Pin title
}
```

**API Flow:**
```
1. POST /v5/media
   - media_type: video
   - Get upload URL
   
2. Upload video to signed URL
   
3. POST /v5/pins
   - board_id, title, description, media_source
```

**Key Gotchas:**
- Must specify board(s) to pin to
- Video Pin requires link (destination URL)
- Thumbnail selectable via timestamp

---

### 8. Threads

**API:** Threads Graph API (via Meta)  
**Auth:** OAuth 2.0

**Scopes Required:**
```
threads_basic
threads_content_publish
```

**Video Requirements:**
```yaml
Container: MP4
Video Codec: H.264
Audio Codec: AAC
Frame Rate: 24-60 fps
Resolution: 1080x1920 recommended
Duration: Up to 5 minutes
Max Size: 1GB
```

**Post-Bridge Configuration:**
```typescript
interface ThreadsConfiguration {
  caption?: string;
  media?: string[];
  location?: 'reels' | 'timeline';  // Post type
}
```

**API Flow:**
```
1. POST /{user-id}/threads
   - media_type: VIDEO
   - video_url
   - text
   
2. Poll until status FINISHED
   
3. POST /{user-id}/threads_publish
   - creation_id
```

**Key Gotchas:**
- Very similar to Instagram API
- Async publishing like Instagram
- Max 500 posts per 24 hours

---

### 9. Bluesky

**API:** AT Protocol  
**Auth:** App Password or OAuth

**Video Requirements:**
```yaml
Container: MP4
Video Codec: H.264
Duration: Up to 60 seconds
Max Size: 50MB
```

**Post-Bridge Configuration:**
```typescript
interface BlueskyConfiguration {
  caption?: string;
  media?: string[];
}
```

**API Flow:**
```
1. POST /xrpc/com.atproto.repo.uploadBlob
   - Binary video data
   
2. POST /xrpc/com.atproto.repo.createRecord
   - collection: app.bsky.feed.post
   - record with embed.video
```

**Key Gotchas:**
- Self-hosted option (AT Protocol is open)
- Smaller file limits than other platforms
- Simpler API than Meta/Google

---

## Video Transcoding Requirements

### Universal Output Format (Safe for All Platforms)
```yaml
Container: MP4
Video Codec: H.264 (High Profile, Level 4.1)
Audio Codec: AAC-LC (128-192 kbps, Stereo)
Frame Rate: 30 fps
Pixel Format: yuv420p
Color Space: bt709
```

### FFmpeg Command for Universal Transcoding
```bash
ffmpeg -i input.mov \
  -c:v libx264 -preset medium -crf 23 \
  -profile:v high -level 4.1 \
  -pix_fmt yuv420p -colorspace bt709 \
  -c:a aac -b:a 128k -ar 44100 -ac 2 \
  -movflags +faststart \
  output.mp4
```

### Platform-Specific Transcoding

**Instagram Reels (9:16, 1080x1920):**
```bash
ffmpeg -i input.mov \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" \
  -c:v libx264 -preset medium -crf 23 \
  -c:a aac -b:a 128k \
  -t 90 \
  output_reels.mp4
```

**YouTube Shorts (9:16, ≤60s):**
```bash
ffmpeg -i input.mov \
  -vf "scale=1080:1920" \
  -c:v libx264 -preset medium -crf 20 \
  -c:a aac -b:a 192k \
  -t 60 \
  output_shorts.mp4
```

---

## Rate Limits Summary

| Platform | Posts/Day | Posts/Hour | Notes |
|----------|-----------|------------|-------|
| Instagram | 25 | ~10 | Per account |
| TikTok | Varies | Varies | API approval dependent |
| YouTube | 100 | 50 | Default quota |
| Facebook | 50 | ~25 | Per page |
| Twitter | 300/3h | 100 | Tweet limit |
| LinkedIn | 150 | 50 | Per member |
| Pinterest | 50 | ~25 | Per account |
| Threads | 500/24h | ~50 | Per account |
| Bluesky | Variable | Variable | Self-hosted unlimited |

---

## Error Handling Patterns

### Common Error Categories
1. **Auth Errors** - Token expired, insufficient permissions
2. **Format Errors** - Wrong codec, aspect ratio, duration
3. **Size Errors** - File too large
4. **Rate Limits** - Too many requests
5. **Processing Errors** - Platform-side transcoding failed

### Post-Bridge's Approach
- **Retry with backoff** for rate limits
- **Pre-validate** formats before upload
- **Server-side transcode** to guarantee compatibility
- **Async status polling** with timeout
- **Detailed error messages** in PostResult

---

## Implementation Checklist

### Phase 1: Core Infrastructure
- [ ] Presigned URL upload service (Supabase Storage)
- [ ] Video transcoding service (FFmpeg on Railway)
- [ ] Job queue for async processing (Background Functions)
- [ ] Unified API layer

### Phase 2: Platform Integrations
- [ ] Instagram (existing - enhance)
- [ ] YouTube (existing - enhance)
- [ ] Facebook (via existing Meta OAuth)
- [ ] TikTok (new)
- [ ] Twitter (new)
- [ ] LinkedIn (new)
- [ ] Pinterest (new)
- [ ] Threads (via Meta OAuth)
- [ ] Bluesky (new)

### Phase 3: Polish
- [ ] Thumbnail selection UI
- [ ] Platform-specific caption editors
- [ ] Scheduling with timezone support
- [ ] Batch posting (Bulk tools)
- [ ] Analytics/results dashboard

---

*Specification compiled: 2026-01-23*
