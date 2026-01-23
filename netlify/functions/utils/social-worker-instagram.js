/**
 * Instagram Worker
 * 
 * Handles posting to Instagram Reels via Meta Graph API
 * 
 * API Flow:
 * 1. Create media container with video URL
 * 2. Wait for container to be ready
 * 3. Publish the container as a Reel
 * 
 * Docs: https://developers.facebook.com/docs/instagram-api/guides/content-publishing
 */

const SocialWorkerBase = require('./social-worker-base');
const fetch = require('node-fetch');

class InstagramWorker extends SocialWorkerBase {
  constructor() {
    super('instagram', {
      maxRetries: 3,
      retryDelay: 2000,
      retryBackoffMultiplier: 2
    });
    
    this.clientId = process.env.META_APP_ID;
    this.clientSecret = process.env.META_APP_SECRET;
    this.apiVersion = 'v18.0';
    this.apiBaseUrl = `https://graph.facebook.com/${this.apiVersion}`;
    
    // Container status polling
    this.maxPollingAttempts = 60; // 5 minutes max
    this.pollingInterval = 5000; // 5 seconds
  }
  
  /**
   * Platform-specific token refresh
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Object} New tokens
   */
  async platformRefreshToken(refreshToken) {
    // Instagram uses long-lived tokens via Meta/Facebook OAuth
    // Exchange refresh token for new access token
    
    const url = `${this.apiBaseUrl}/oauth/access_token`;
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: refreshToken
    });
    
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || 'Token refresh failed');
    }
    
    return {
      access_token: data.access_token,
      expires_in: data.expires_in || 5184000 // 60 days default
    };
  }
  
  /**
   * Validate video for Instagram Reels
   * @param {Object} video - Video data
   * @returns {Object} Validation result
   */
  validateVideo(video) {
    const errors = [];
    
    // Duration: 3 seconds to 90 seconds for Reels
    if (video.duration) {
      if (video.duration < 3) {
        errors.push('Video must be at least 3 seconds long');
      }
      if (video.duration > 90) {
        errors.push('Video must be 90 seconds or less for Reels');
      }
    }
    
    // File size: Max 1GB
    if (video.file_size && video.file_size > 1024 * 1024 * 1024) {
      errors.push('Video file size must be 1GB or less');
    }
    
    // Aspect ratio: 9:16 recommended for Reels
    if (video.width && video.height) {
      const aspectRatio = video.width / video.height;
      if (aspectRatio < 0.5 || aspectRatio > 0.6) {
        errors.push('Video should have 9:16 aspect ratio (vertical) for best Reels display');
      }
    }
    
    // Format: MP4 or MOV
    const supportedFormats = ['video/mp4', 'video/quicktime'];
    if (video.mime_type && !supportedFormats.includes(video.mime_type)) {
      errors.push(`Video format must be MP4 or MOV (got ${video.mime_type})`);
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Get Instagram Reels requirements
   * @returns {Object} Requirements
   */
  getRequirements() {
    return {
      maxDuration: 90, // seconds
      minDuration: 3,
      maxFileSize: 1024 * 1024 * 1024, // 1GB
      supportedFormats: ['video/mp4', 'video/quicktime'],
      aspectRatio: '9:16',
      maxCaptionLength: 2200
    };
  }
  
  /**
   * Post video to Instagram Reels
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {Object} Result
   */
  async postToPlatform(account, post, video) {
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
      
      // Step 1: Create media container
      console.log(`[Instagram] Creating media container for video ${video.id}...`);
      const containerId = await this.createMediaContainer(account, post, video);
      
      // Step 2: Poll for container status
      console.log(`[Instagram] Waiting for container ${containerId} to be ready...`);
      await this.waitForContainer(account, containerId);
      
      // Step 3: Publish container
      console.log(`[Instagram] Publishing container ${containerId}...`);
      const publishResult = await this.publishContainer(account, containerId);
      
      return {
        success: true,
        platformPostId: publishResult.id,
        platformPostUrl: `https://www.instagram.com/reel/${publishResult.id}/`,
        metadata: {
          containerId,
          publishedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('[Instagram] Post failed:', error);
      return {
        success: false,
        error: error.message,
        code: error.code || 'POST_FAILED',
        metadata: error.details
      };
    }
  }
  
  /**
   * Create media container for Reel
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {string} Container ID
   */
  async createMediaContainer(account, post, video) {
    return this.retryWithBackoff(async () => {
      const url = `${this.apiBaseUrl}/${account.account_id}/media`;
      
      const params = {
        media_type: 'REELS',
        video_url: video.url,
        share_to_feed: true // Also post to feed
      };
      
      // Add caption if provided
      if (post.caption) {
        params.caption = post.caption.substring(0, 2200); // Truncate to limit
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...params,
          access_token: account.access_token
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Failed to create media container');
        error.statusCode = response.status;
        error.code = data.error?.code;
        error.details = data.error;
        throw error;
      }
      
      return data.id;
    }, 'Create media container');
  }
  
  /**
   * Wait for media container to be ready
   * @param {Object} account - Account with decrypted tokens
   * @param {string} containerId - Container ID
   * @returns {Promise<void>}
   */
  async waitForContainer(account, containerId) {
    for (let attempt = 1; attempt <= this.maxPollingAttempts; attempt++) {
      const url = `${this.apiBaseUrl}/${containerId}`;
      const params = new URLSearchParams({
        fields: 'status_code,status',
        access_token: account.access_token
      });
      
      const response = await fetch(`${url}?${params.toString()}`);
      const data = await response.json();
      
      if (!response.ok || data.error) {
        throw new Error(data.error?.message || 'Failed to check container status');
      }
      
      // Status codes:
      // FINISHED - Ready to publish
      // IN_PROGRESS - Processing
      // ERROR - Failed
      
      if (data.status_code === 'FINISHED') {
        console.log(`[Instagram] Container ready after ${attempt * this.pollingInterval / 1000}s`);
        return;
      }
      
      if (data.status_code === 'ERROR') {
        throw new Error(`Container processing failed: ${data.status}`);
      }
      
      // Still processing, wait and retry
      if (attempt < this.maxPollingAttempts) {
        await this.sleep(this.pollingInterval);
      }
    }
    
    throw new Error('Container processing timeout (5 minutes)');
  }
  
  /**
   * Publish media container as Reel
   * @param {Object} account - Account with decrypted tokens
   * @param {string} containerId - Container ID
   * @returns {Object} Publish result
   */
  async publishContainer(account, containerId) {
    return this.retryWithBackoff(async () => {
      const url = `${this.apiBaseUrl}/${account.account_id}/media_publish`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creation_id: containerId,
          access_token: account.access_token
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Failed to publish container');
        error.statusCode = response.status;
        error.code = data.error?.code;
        error.details = data.error;
        throw error;
      }
      
      return data;
    }, 'Publish container');
  }
}

module.exports = InstagramWorker;
