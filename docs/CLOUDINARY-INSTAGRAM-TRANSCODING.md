# Cloudinary Instagram Video Transcoding - Implementation Summary

## Overview
Implemented automatic video transcoding for Instagram uploads using Cloudinary to resolve Instagram error 2207078.

**Problem:** Instagram requires MP4 format with H.264 video codec and AAC audio codec. User videos in .mov format were failing to upload.

**Solution:** Cloudinary automatically transcodes videos to Instagram-compatible format before posting.

## Changes Made

### 1. Added Cloudinary Dependency
**File:** `netlify/functions/package.json`
```json
"cloudinary": "^1.41.0"
```

### 2. Updated Instagram Posting Function
**File:** `netlify/functions/social-post.js`

- Added Cloudinary import and configuration
- Completely rewrote `postToInstagram` function with new workflow:
  1. Download video from OneDrive
  2. Upload to Cloudinary with transcoding transformation (H.264/AAC)
  3. Get transcoded video URL from Cloudinary
  4. Use Cloudinary URL for Instagram posting
  5. Clean up Cloudinary file after successful post
- Added comprehensive error handling for missing Cloudinary configuration
- Increased processing timeout from 12 to 20 checks (100 seconds total)

### 3. Updated Environment Configuration
**File:** `.env.production.example`

Added Cloudinary environment variables with documentation:
```env
# Cloudinary Configuration (for Instagram video transcoding)
# Instagram requires MP4 with H.264/AAC codecs. Cloudinary automatically transcodes videos.
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

## Required Environment Variables for Netlify

Pete needs to add these three environment variables in Netlify:

1. **CLOUDINARY_CLOUD_NAME** - Your Cloudinary cloud name
2. **CLOUDINARY_API_KEY** - Your Cloudinary API key
3. **CLOUDINARY_API_SECRET** - Your Cloudinary API secret

### How to Get Cloudinary Credentials

1. Sign up for free at https://cloudinary.com/
2. Go to Dashboard after login
3. Copy the following from the "Account Details" section:
   - **Cloud Name** → CLOUDINARY_CLOUD_NAME
   - **API Key** → CLOUDINARY_API_KEY
   - **API Secret** → CLOUDINARY_API_SECRET

**Note:** Free tier includes 25 credits/month (sufficient for most use cases)

### Adding to Netlify

1. Go to Netlify Dashboard
2. Select your site (ebay-price-reducer)
3. Go to **Site settings** → **Environment variables**
4. Click **Add a variable**
5. Add each of the three variables above
6. Click **Save**
7. Redeploy the site for changes to take effect

## How It Works

### New Instagram Upload Flow

```
1. User selects .mov video for Instagram posting
   ↓
2. Function downloads video from OneDrive
   ↓
3. Function uploads video to Cloudinary
   ├─ Cloudinary transcodes to MP4
   ├─ Applies H.264 video codec
   ├─ Applies AAC audio codec
   └─ Returns transcoded video URL
   ↓
4. Function uses Cloudinary URL for Instagram API
   ↓
5. Instagram processes and publishes video
   ↓
6. Function cleans up Cloudinary file (optional)
   ↓
7. Success! Video is posted to Instagram
```

### Cloudinary Transformation Settings

```javascript
{
  resource_type: 'video',
  format: 'mp4',
  transformation: [
    {
      video_codec: 'h264',
      audio_codec: 'aac',
      quality: 'auto:good'
    }
  ],
  folder: `instagram/${userId}`,
  public_id: `video_${Date.now()}`
}
```

## Error Handling

### Missing Cloudinary Configuration
If environment variables are not set, users receive a clear error:
```
Instagram requires video transcoding. Please configure Cloudinary environment variables 
(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) or export videos 
as MP4 with H.264/AAC codecs.
```

### Automatic Cleanup
- Cloudinary files are automatically deleted after successful Instagram post
- If posting fails, cleanup still occurs to prevent storage bloat
- Cleanup failures don't crash the main operation (logged as warnings)

## Testing Instructions

### 1. Configure Cloudinary
- Add the three environment variables to Netlify
- Redeploy the site

### 2. Test Instagram Posting
1. Log into the app
2. Go to the social media posting page
3. Select a video (any format: .mov, .mp4, .avi, etc.)
4. Select "Instagram" as the platform
5. Add title and description
6. Click "Post"

### 3. Expected Behavior
- Video should upload to Cloudinary
- Console logs should show transcoding progress
- Instagram should accept the video without error 2207078
- Video should appear on Instagram
- Cloudinary file should be cleaned up

### 4. Verification
Check Netlify function logs for:
```
Starting Instagram post with Cloudinary transcoding
Downloaded video: [size] bytes
Uploading to Cloudinary for transcoding...
Cloudinary upload success: [public_id]
Transcoded video URL: [url]
Instagram container created: [container_id]
Instagram processing status...
Instagram post success: [post_id]
Cloudinary file cleanup successful
```

## Cost Considerations

### Cloudinary Free Tier
- **Storage:** 25 GB
- **Bandwidth:** 25 GB/month
- **Transformations:** 25,000 per month
- **Video transformations:** Included in transformation quota

### Estimated Usage
- Average video: 10-50 MB
- Transcoding: 1 transformation per video
- Storage: Files deleted after posting (minimal storage use)

**Conclusion:** Free tier should handle hundreds of Instagram posts per month.

## Fallback Options

If Cloudinary is not configured, users have two options:

1. **Add Cloudinary credentials** (recommended)
2. **Export videos manually as MP4 with H.264/AAC** before uploading to OneDrive

## Deployment Status

✅ **Committed and Pushed** to `main` branch  
📝 **Commit:** `03f3949` - "Add Cloudinary video transcoding for Instagram uploads"  
🔄 **Next Step:** Pete adds environment variables to Netlify and redeploys

## Support

If issues occur:
1. Check Netlify function logs for error messages
2. Verify all three Cloudinary environment variables are set correctly
3. Confirm Cloudinary account is active and has available credits
4. Test with a simple MP4 video first to isolate transcoding issues

---

**Implementation Date:** January 22, 2026  
**Implemented By:** Backend Agent  
**Status:** ✅ Complete - Awaiting Netlify Configuration
