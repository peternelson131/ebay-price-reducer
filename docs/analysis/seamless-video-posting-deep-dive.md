# Seamless Video Posting - Deep Technical Analysis

**Date:** 2026-01-23  
**Purpose:** Document the technical patterns that enable seamless cross-platform video posting

---

## The Core Problem

Users have videos in various formats (MOV, MP4, different codecs) and want to post them to multiple social platforms with one click. Each platform has different requirements:

| Requirement | Instagram | TikTok | YouTube | Twitter | Challenge |
|-------------|-----------|--------|---------|---------|-----------|
| Container | MP4 only | MP4/MOV | Many | MP4 | MOV common from iPhone |
| Codec | H.264 | H.264/HEVC | H.264 | H.264 High | HEVC not universal |
| Duration | 90s max | 10 min | 12 hrs | 2:20 | Platform limits vary |
| Size | 100MB | 4GB | 256GB | 512MB | Huge variance |
| Aspect | 9:16 | 9:16 | Any | Any | Reels need vertical |

**Without server-side processing:** User must manually transcode videos for each platform.  
**With server-side processing:** Upload once, system handles everything.

---

## Post-Bridge's Technical Approach

### 1. Accept Multiple Input Formats
```yaml
Accepted Inputs:
  - video/mp4 (MP4)
  - video/quicktime (MOV)
  - video/webm (WebM)
```

Key insight: Accept what users actually have (iPhone = MOV), not what platforms want.

### 2. Universal Intermediate Format
Transcode everything to a "universal" format that works everywhere:

```yaml
Universal Output:
  Container: MP4
  Video: H.264, High Profile, Level 4.1
  Audio: AAC-LC, 128kbps, 44.1kHz, Stereo
  Pixel Format: yuv420p
  Color Space: bt709
  Faststart: enabled (moov atom at beginning)
```

### 3. Platform-Specific Variants
Generate optimized versions for platforms with special requirements:

```
Input.mov
    │
    ├──► universal.mp4 (H.264/AAC, original aspect)
    │        │
    │        ├──► instagram_reels.mp4 (1080x1920, ≤90s)
    │        ├──► youtube_shorts.mp4 (1080x1920, ≤60s)
    │        └──► tiktok.mp4 (1080x1920, original duration)
    │
    └──► thumbnail.jpg (from video_cover_timestamp_ms)
```

### 4. The `processing_enabled` Flag
```typescript
{
  processing_enabled: true  // Default
}
```

When `true`:
- Server transcodes video to universal format
- Creates platform-specific variants as needed
- Handles aspect ratio adjustments
- Ensures codec compatibility

When `false`:
- Direct upload to platform (may fail if incompatible)
- Useful for pre-processed videos

---

## FFmpeg Pipeline (What Post-Bridge Likely Uses)

### Stage 1: Probe Input
```bash
ffprobe -v quiet -print_format json -show_format -show_streams input.mov
```

Extract:
- Duration
- Resolution
- Codec
- Aspect ratio
- Bitrate

### Stage 2: Universal Transcode
```bash
ffmpeg -i input.mov \
  -c:v libx264 \
  -preset medium \
  -crf 23 \
  -profile:v high \
  -level 4.1 \
  -pix_fmt yuv420p \
  -colorspace bt709 \
  -color_primaries bt709 \
  -color_trc bt709 \
  -c:a aac \
  -b:a 128k \
  -ar 44100 \
  -ac 2 \
  -movflags +faststart \
  -y output.mp4
```

**Key flags explained:**
- `-crf 23`: Quality level (18-28 typical, lower = better quality)
- `-profile:v high`: H.264 profile for wide compatibility
- `-level 4.1`: Supports up to 1080p60
- `-pix_fmt yuv420p`: Most compatible pixel format
- `-movflags +faststart`: Moves moov atom for streaming

### Stage 3: Platform Variants (if needed)

**Instagram Reels (force 9:16):**
```bash
ffmpeg -i universal.mp4 \
  -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" \
  -t 90 \
  -c:v libx264 -crf 23 \
  -c:a copy \
  instagram_reels.mp4
```

**Thumbnail extraction:**
```bash
ffmpeg -i universal.mp4 \
  -ss 00:00:05 \
  -vframes 1 \
  -q:v 2 \
  thumbnail.jpg
```

Or with `video_cover_timestamp_ms`:
```bash
ffmpeg -i universal.mp4 \
  -ss $(echo "scale=3; 5000/1000" | bc) \
  -vframes 1 \
  thumbnail.jpg
```

---

## Architecture for Seamless Posting

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER UPLOAD                              │
│                    (MOV, MP4, various codecs)                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRESIGNED URL UPLOAD                          │
│              (Client → S3/Supabase Storage)                      │
│                                                                  │
│   1. POST /media/create-upload-url                               │
│      → Returns { media_id, upload_url }                          │
│                                                                  │
│   2. PUT upload_url (direct to storage)                          │
│      → File uploaded, triggers processing webhook                │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VIDEO PROCESSING QUEUE                        │
│                                                                  │
│   1. Receive upload notification                                 │
│   2. Download from storage                                       │
│   3. Probe video metadata                                        │
│   4. Transcode to universal format                               │
│   5. Generate platform variants (if needed)                      │
│   6. Extract thumbnail                                           │
│   7. Upload processed files to storage                           │
│   8. Update media record with processed URLs                     │
│   9. Mark as "ready"                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POST CREATION                               │
│                                                                  │
│   POST /posts                                                    │
│   {                                                              │
│     caption: "...",                                              │
│     media: [media_id],                                           │
│     social_accounts: [instagram_id, youtube_id],                 │
│     platform_configurations: {...}                               │
│   }                                                              │
│                                                                  │
│   → Returns { post_id, status: "processing" }                    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   PLATFORM PUBLISH QUEUE                         │
│                                                                  │
│   For each selected platform:                                    │
│                                                                  │
│   Instagram:                                                     │
│   1. Upload video to Graph API                                   │
│   2. Wait for "FINISHED" status                                  │
│   3. Publish container                                           │
│   4. Store result                                                │
│                                                                  │
│   YouTube:                                                       │
│   1. Resumable upload to Data API                                │
│   2. Wait for processing                                         │
│   3. Store result                                                │
│                                                                  │
│   etc...                                                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      POST RESULTS                                │
│                                                                  │
│   GET /post-results?post_id=xxx                                  │
│   [                                                              │
│     { platform: "instagram", success: true, url: "..." },        │
│     { platform: "youtube", success: true, url: "..." }           │
│   ]                                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Success Factors

### 1. Accept User's Native Formats
Don't force users to convert before upload. Accept:
- MOV (iPhone default)
- MP4 (Android/DSLR)
- HEVC/H.265 (newer iPhones)
- Various frame rates (24/30/60 fps)

### 2. Server-Side Transcoding is Mandatory
Client-side transcoding is:
- Slow (minutes for HD video)
- Unreliable (browser limitations)
- Poor UX (blocking)

Server-side transcoding:
- Fast (dedicated hardware)
- Reliable (controlled environment)
- Good UX (upload and go)

### 3. Presigned URLs for Upload
Don't proxy video through your API server:
- Bandwidth expensive
- Slow
- Memory pressure

Presigned URLs:
- Direct to S3/GCS
- Fast
- Scalable

### 4. Async Everything
Video processing takes time. Never block:
- Upload → immediate response with media_id
- Processing → background job
- Publishing → background job
- Status → polling or webhooks

### 5. Platform-Specific Error Handling
Each platform fails differently:
- Instagram: Async container creation can fail
- YouTube: Processing can reject after upload
- TikTok: Draft mode for review
- Twitter: Strict duration limits

Build retry logic and clear error messages.

---

## Self-Hosted Implementation Stack

### Our Existing Components
| Component | Current | Status |
|-----------|---------|--------|
| Storage | Supabase Storage | ✅ Ready |
| Database | Supabase PostgreSQL | ✅ Ready |
| API | Netlify Functions | ✅ Ready |
| Background Jobs | Netlify Background Functions | ✅ Ready |
| Transcoding | Railway (FFmpeg) | ✅ Ready |
| Instagram OAuth | Meta Graph API | ✅ Ready |
| YouTube OAuth | Google OAuth | ✅ Ready |

### What We Need to Build
| Component | Effort | Priority |
|-----------|--------|----------|
| Unified API layer | 8 hours | High |
| Presigned URL flow | 4 hours | High |
| Video probe/transcode service | 4 hours | High (enhance existing) |
| Post creation with scheduling | 8 hours | High |
| Post results tracking | 4 hours | Medium |
| Platform workers (enhance) | 4 hours | Medium |
| New platforms (TikTok, etc.) | 16 hours | Low |

**Total: ~48 hours for full Post-Bridge equivalent**

---

## Quick Win: Enhance Existing Implementation

We already have pre-upload transcoding! Our current flow:
1. Video synced from OneDrive
2. Background function transcodes to MP4
3. Stored in Supabase
4. "Ready to Post" status shown

**To make it seamless like Post-Bridge:**

1. **Add universal transcode settings**
   ```javascript
   // In video-transcode-background.js
   const UNIVERSAL_SETTINGS = {
     codec: 'libx264',
     profile: 'high',
     level: '4.1',
     crf: 23,
     pixelFormat: 'yuv420p',
     audioCodec: 'aac',
     audioBitrate: '128k'
   };
   ```

2. **Add platform variant generation**
   - If video is horizontal, create vertical crop for Reels
   - If duration > 60s, create YouTube Shorts version

3. **Use pre-transcoded URL in social-post**
   - Already implemented! `social_ready_url` field

4. **Add post results tracking**
   - New table: `post_results`
   - Store success/failure + platform URL

---

## Summary

**What makes video posting "seamless":**

1. ✅ Accept MOV and other native formats
2. ✅ Server-side FFmpeg transcoding to universal H.264/AAC
3. ✅ Presigned URLs for fast uploads
4. ✅ Async processing with status tracking
5. ✅ Platform-specific optimizations (aspect ratio, duration)
6. ✅ Detailed error handling and results

**We're 70% there. Key gaps:**
- Need universal transcode settings in our FFmpeg
- Need platform variant generation (Reels crop)
- Need post results tracking table
- Need unified API for multi-platform posting

---

*Deep dive completed: 2026-01-23*
