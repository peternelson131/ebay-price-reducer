/**
 * YouTube Worker
 * 
 * Handles posting to YouTube Shorts via YouTube Data API v3
 * 
 * API Flow:
 * 1. Download video from URL
 * 2. Initiate resumable upload
 * 3. Upload video chunks
 * 4. Set video metadata (title, description, shorts category)
 * 
 * Docs: https://developers.google.com/youtube/v3/docs/videos/insert
 * Shorts: Videos ≤60 seconds with #Shorts in title/description
 */

const SocialWorkerBase = require('./social-worker-base');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');
const os = require('os');

class YouTubeWorker extends SocialWorkerBase {
  constructor() {
    super('youtube', {
      maxRetries: 3,
      retryDelay: 2000,
      retryBackoffMultiplier: 2
    });
    
    this.clientId = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.apiBaseUrl = 'https://www.googleapis.com/youtube/v3';
    this.uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos';
    
    // Upload chunk size (10MB recommended for resumable uploads)
    this.chunkSize = 10 * 1024 * 1024;
  }
  
  /**
   * Platform-specific token refresh
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Object} New tokens
   */
  async platformRefreshToken(refreshToken) {
    const url = 'https://oauth2.googleapis.com/token';
    
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error_description || data.error || 'Token refresh failed');
    }
    
    return {
      access_token: data.access_token,
      refresh_token: refreshToken, // Google doesn't return new refresh token
      expires_in: data.expires_in || 3600
    };
  }
  
  /**
   * Validate video for YouTube Shorts
   * @param {Object} video - Video data
   * @returns {Object} Validation result
   */
  validateVideo(video) {
    const errors = [];
    
    // Duration: Must be 60 seconds or less for Shorts
    if (video.duration) {
      if (video.duration > 60) {
        errors.push('Video must be 60 seconds or less for YouTube Shorts');
      }
    }
    
    // File size: Max 256GB (YouTube limit, but practically much smaller)
    if (video.file_size && video.file_size > 10 * 1024 * 1024 * 1024) {
      errors.push('Video file size too large (practical limit: 10GB)');
    }
    
    // Aspect ratio: Vertical (9:16) recommended for Shorts
    if (video.width && video.height) {
      const aspectRatio = video.width / video.height;
      if (aspectRatio > 1) {
        errors.push('Video should be vertical (portrait) for YouTube Shorts');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Get YouTube Shorts requirements
   * @returns {Object} Requirements
   */
  getRequirements() {
    return {
      maxDuration: 60, // seconds
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB practical limit
      supportedFormats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'],
      aspectRatio: '9:16',
      maxCaptionLength: 5000 // description limit
    };
  }
  
  /**
   * Post video to YouTube Shorts
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {Object} Result
   */
  async postToPlatform(account, post, video) {
    let tempFilePath = null;
    
    try {
      // Validate video
      const validation = this.validateVideo(video);
      if (!validation.valid) {
        return {
          success: false,
          error: `Video validation failed: ${validation.errors.join(', ')}`,
          code: 'VIDEO_VALIDATION_FAILED'
        };
      }
      
      // Step 1: Download video to temp file
      console.log(`[YouTube] Downloading video ${video.id}...`);
      tempFilePath = await this.downloadVideo(video.url);
      
      // Step 2: Prepare metadata
      const metadata = this.prepareMetadata(post, video);
      
      // Step 3: Upload video with resumable upload
      console.log(`[YouTube] Uploading video to YouTube...`);
      const videoId = await this.uploadVideo(account, tempFilePath, metadata);
      
      // Step 4: Return success
      return {
        success: true,
        platformPostId: videoId,
        platformPostUrl: `https://www.youtube.com/shorts/${videoId}`,
        metadata: {
          uploadedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('[YouTube] Post failed:', error);
      return {
        success: false,
        error: error.message,
        code: error.code || 'POST_FAILED',
        metadata: error.details
      };
    } finally {
      // Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
        console.log(`[YouTube] Cleaned up temp file: ${tempFilePath}`);
      }
    }
  }
  
  /**
   * Download video to temp file
   * @param {string} videoUrl - Video URL
   * @returns {string} Temp file path
   */
  async downloadVideo(videoUrl) {
    const response = await fetch(videoUrl);
    
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }
    
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `youtube-upload-${Date.now()}.mp4`);
    const fileStream = fs.createWriteStream(tempFile);
    
    return new Promise((resolve, reject) => {
      response.body.pipe(fileStream);
      response.body.on('error', reject);
      fileStream.on('finish', () => resolve(tempFile));
      fileStream.on('error', reject);
    });
  }
  
  /**
   * Prepare video metadata for YouTube
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {Object} Metadata
   */
  prepareMetadata(post, video) {
    // Title: Use video title or caption (with #Shorts)
    let title = video.title || 'New Short';
    if (!title.includes('#Shorts')) {
      title = `${title} #Shorts`;
    }
    title = title.substring(0, 100); // YouTube title limit
    
    // Description: Use caption
    let description = post.caption || '';
    if (!description.includes('#Shorts')) {
      description = `${description}\n\n#Shorts`;
    }
    description = description.substring(0, 5000); // YouTube description limit
    
    return {
      snippet: {
        title,
        description,
        categoryId: '22', // People & Blogs category
        tags: ['Shorts']
      },
      status: {
        privacyStatus: 'public',
        selfDeclaredMadeForKids: false
      }
    };
  }
  
  /**
   * Upload video using resumable upload
   * @param {Object} account - Account with decrypted tokens
   * @param {string} filePath - Path to video file
   * @param {Object} metadata - Video metadata
   * @returns {string} Video ID
   */
  async uploadVideo(account, filePath, metadata) {
    return this.retryWithBackoff(async () => {
      // Step 1: Initiate resumable upload
      const uploadUrl = await this.initiateResumableUpload(account, metadata);
      
      // Step 2: Upload file
      const fileSize = fs.statSync(filePath).size;
      const fileStream = fs.createReadStream(filePath);
      
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Length': fileSize.toString(),
          'Content-Type': 'video/*'
        },
        body: fileStream
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Failed to upload video');
        error.statusCode = response.status;
        error.code = data.error?.code;
        error.details = data.error;
        throw error;
      }
      
      return data.id;
    }, 'Upload video');
  }
  
  /**
   * Initiate resumable upload session
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} metadata - Video metadata
   * @returns {string} Upload URL
   */
  async initiateResumableUpload(account, metadata) {
    const url = `${this.uploadUrl}?uploadType=resumable&part=snippet,status`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${account.access_token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': 'video/*'
      },
      body: JSON.stringify(metadata)
    });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message || 'Failed to initiate upload');
    }
    
    // Get upload URL from Location header
    const uploadUrl = response.headers.get('location');
    if (!uploadUrl) {
      throw new Error('No upload URL returned');
    }
    
    return uploadUrl;
  }
}

module.exports = YouTubeWorker;
