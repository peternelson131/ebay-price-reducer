/**
 * TikTok Worker
 * 
 * Handles posting to TikTok via Content Posting API v2
 * 
 * API Flow:
 * 1. Initialize video upload (POST /v2/post/publish/video/init/)
 * 2. TikTok downloads video from provided URL
 * 3. Video is published to user's account
 * 
 * Docs: https://developers.tiktok.com/doc/content-posting-api-get-started
 * 
 * Requirements:
 * - Max duration: 10 minutes (600 seconds)
 * - Max file size: 4GB
 * - Supported formats: MP4, WebM, MOV
 * - Aspect ratios: 9:16 (vertical), 1:1 (square), 16:9 (horizontal)
 * - AI-generated content must set is_aigc flag
 */

const SocialWorkerBase = require('./social-worker-base');
const fetch = require('node-fetch');

class TikTokWorker extends SocialWorkerBase {
  constructor() {
    super('tiktok', {
      maxRetries: 3,
      retryDelay: 2000,
      retryBackoffMultiplier: 2
    });
    
    this.clientKey = process.env.TIKTOK_CLIENT_KEY;
    this.clientSecret = process.env.TIKTOK_CLIENT_SECRET;
    this.apiBaseUrl = 'https://open.tiktokapis.com/v2';
  }
  
  /**
   * Platform-specific token refresh
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Object} New tokens
   */
  async platformRefreshToken(refreshToken) {
    const url = 'https://open.tiktokapis.com/v2/oauth/token/';
    
    const params = new URLSearchParams({
      client_key: this.clientKey,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cache-Control': 'no-cache'
      },
      body: params.toString()
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || data.message || 'Token refresh failed');
    }
    
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token || refreshToken, // Use new if provided
      expires_in: data.expires_in || 86400 // Default 24 hours
    };
  }
  
  /**
   * Validate video for TikTok
   * @param {Object} video - Video data
   * @returns {Object} Validation result
   */
  validateVideo(video) {
    const errors = [];
    
    // Duration: Max 10 minutes (600 seconds)
    if (video.duration) {
      if (video.duration > 600) {
        errors.push('Video must be 10 minutes or less for TikTok');
      }
      if (video.duration < 3) {
        errors.push('Video must be at least 3 seconds for TikTok');
      }
    }
    
    // File size: Max 4GB
    if (video.file_size && video.file_size > 4 * 1024 * 1024 * 1024) {
      errors.push('Video file size too large (max 4GB for TikTok)');
    }
    
    // Aspect ratio: Vertical (9:16) strongly recommended
    if (video.width && video.height) {
      const aspectRatio = video.width / video.height;
      if (aspectRatio > 1.2) {
        // Just a warning, not an error - TikTok accepts horizontal videos
        console.warn('Horizontal videos may not perform well on TikTok. Vertical (9:16) recommended.');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Get platform requirements
   * @returns {Object} Requirements
   */
  getRequirements() {
    return {
      maxDuration: 600, // 10 minutes
      minDuration: 3, // 3 seconds
      maxFileSize: 4 * 1024 * 1024 * 1024, // 4GB
      supportedFormats: ['mp4', 'webm', 'mov'],
      maxCaptionLength: 2200, // TikTok caption limit
      recommendedAspectRatio: '9:16',
      supportedAspectRatios: ['9:16', '1:1', '16:9']
    };
  }
  
  /**
   * Post video to TikTok
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} post - Post data (caption, etc.)
   * @param {Object} video - Video data (url, duration, etc.)
   * @returns {Object} Result { success, platformPostId?, platformPostUrl?, error? }
   */
  async postToPlatform(account, post, video) {
    try {
      // Validate video
      const validation = this.validateVideo(video);
      if (!validation.valid) {
        throw new Error(`Video validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Prepare caption (max 2200 characters)
      let caption = post.caption || '';
      if (caption.length > 2200) {
        console.warn('Caption exceeds 2200 characters, truncating...');
        caption = caption.substring(0, 2197) + '...';
      }
      
      // Initialize video upload
      const uploadResult = await this.retryWithBackoff(
        () => this.initializeVideoUpload(account.access_token, video.url, caption, post),
        'TikTok video upload initialization'
      );
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Failed to initialize TikTok upload');
      }
      
      // TikTok processes the video asynchronously
      // The publish_id can be used to check status later
      const publishId = uploadResult.publish_id;
      
      // Generate TikTok profile URL (we don't get the exact video URL immediately)
      const profileUrl = account.account_metadata?.profile_url || 
                        `https://www.tiktok.com/@${account.username}`;
      
      return {
        success: true,
        platformPostId: publishId,
        platformPostUrl: profileUrl, // Link to profile since video URL not immediately available
        metadata: {
          publish_id: publishId,
          status: 'processing', // TikTok processes asynchronously
          share_url: uploadResult.share_url // If provided by TikTok
        }
      };
      
    } catch (error) {
      console.error('TikTok posting error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error during TikTok posting'
      };
    }
  }
  
  /**
   * Initialize video upload to TikTok
   * @param {string} accessToken - Access token
   * @param {string} videoUrl - Public URL to video file
   * @param {string} caption - Video caption/title
   * @param {Object} post - Additional post options
   * @returns {Object} Upload result
   */
  async initializeVideoUpload(accessToken, videoUrl, caption, post = {}) {
    const url = `${this.apiBaseUrl}/post/publish/video/init/`;
    
    // Build request body
    const body = {
      post_info: {
        title: caption, // TikTok uses "title" for the caption
        privacy_level: 'PUBLIC_TO_EVERYONE', // Default to public
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000, // Use frame at 1 second as thumbnail
        
        // AI-generated content labeling (required for AI content)
        // Set to true if video is AI-generated (e.g., from dubbing, generation, etc.)
        // The frontend/caller should pass this flag if known
        is_aigc: post.is_aigc || false
      },
      source_info: {
        source: 'PULL_FROM_URL', // TikTok downloads from our URL
        video_url: videoUrl
      }
    };
    
    // Optional: Allow custom privacy level from post data
    if (post.privacy_level) {
      body.post_info.privacy_level = post.privacy_level;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (!response.ok || data.error) {
      console.error('TikTok upload init error:', JSON.stringify(data));
      
      // Handle specific TikTok errors
      if (data.error?.code === 'access_token_invalid') {
        throw new Error('Invalid or expired TikTok access token');
      }
      
      if (data.error?.code === 'rate_limit_exceeded') {
        const retryError = new Error('TikTok rate limit exceeded');
        retryError.statusCode = 429;
        throw retryError;
      }
      
      if (data.error?.code === 'spam_risk_too_many_posts') {
        throw new Error('TikTok spam protection: too many posts in short time');
      }
      
      throw new Error(data.error?.message || 'Failed to initialize video upload');
    }
    
    // Extract publish ID from response
    const publishId = data.data?.publish_id;
    const shareUrl = data.data?.share_url;
    
    if (!publishId) {
      console.error('No publish_id in response:', JSON.stringify(data));
      throw new Error('TikTok did not return a publish_id');
    }
    
    console.log('TikTok upload initialized:', publishId);
    
    return {
      success: true,
      publish_id: publishId,
      share_url: shareUrl
    };
  }
  
  /**
   * Check video upload status (optional - for future use)
   * @param {string} accessToken - Access token
   * @param {string} publishId - Publish ID from initialization
   * @returns {Object} Status info
   */
  async checkUploadStatus(accessToken, publishId) {
    // TikTok Content Posting API v2 doesn't have a status check endpoint yet
    // This is a placeholder for when they add it
    // For now, we assume the upload succeeds asynchronously
    console.warn('TikTok upload status check not yet implemented');
    return {
      status: 'unknown',
      publish_id: publishId
    };
  }
}

module.exports = TikTokWorker;
