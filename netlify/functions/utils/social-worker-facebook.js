/**
 * Facebook Worker
 * 
 * Handles posting videos to Facebook Pages via Meta Graph API
 * 
 * API Flow:
 * 1. Get user's Facebook Pages (/me/accounts)
 * 2. Use the Page access token to post video
 * 3. POST /{page-id}/videos with video URL and caption
 * 
 * Docs: https://developers.facebook.com/docs/video-api/guides/publishing
 */

const SocialWorkerBase = require('./social-worker-base');
const fetch = require('node-fetch');

class FacebookWorker extends SocialWorkerBase {
  constructor() {
    super('facebook', {
      maxRetries: 3,
      retryDelay: 2000,
      retryBackoffMultiplier: 2
    });
    
    this.clientId = process.env.META_APP_ID;
    this.clientSecret = process.env.META_APP_SECRET;
    this.apiVersion = 'v18.0';
    this.apiBaseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }
  
  /**
   * Override getAccount to use Instagram account (same Meta OAuth)
   * Facebook and Instagram share the same Meta access token
   * @param {string} userId - User ID
   * @returns {Object} Account with decrypted tokens
   */
  async getAccount(userId) {
    // Facebook uses the Instagram account's Meta OAuth token
    const { data: account, error } = await this.supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', 'instagram') // Use Instagram account (same Meta token)
      .eq('is_active', true)
      .single();
    
    if (error || !account) {
      throw new Error('No active Instagram/Meta account found. Connect Instagram to enable Facebook posting.');
    }
    
    // Check if token is expired
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at);
      const now = new Date();
      
      // Refresh if expired or expiring within 5 minutes
      if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
        console.log(`Token expired/expiring for Meta, refreshing...`);
        const refreshedAccount = await this.refreshToken(account);
        return refreshedAccount;
      }
    }
    
    // Decrypt tokens using the same method as base class
    const { decryptToken } = require('./social-token-encryption');
    try {
      account.access_token = decryptToken(account.access_token);
      if (account.refresh_token) {
        account.refresh_token = decryptToken(account.refresh_token);
      }
    } catch (decryptError) {
      throw new Error(`Failed to decrypt tokens: ${decryptError.message}`);
    }
    
    return account;
  }
  
  /**
   * Platform-specific token refresh
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Object} New tokens
   */
  async platformRefreshToken(refreshToken) {
    // Facebook uses long-lived tokens via Meta/Facebook OAuth
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
   * Validate video for Facebook
   * @param {Object} video - Video data
   * @returns {Object} Validation result
   */
  validateVideo(video) {
    const errors = [];
    
    // Duration: Max 240 minutes (14400 seconds)
    if (video.duration && video.duration > 14400) {
      errors.push('Video must be 240 minutes (4 hours) or less');
    }
    
    // File size: Max 10GB for URLs
    if (video.file_size && video.file_size > 10 * 1024 * 1024 * 1024) {
      errors.push('Video file size must be 10GB or less');
    }
    
    // Format: Facebook supports most common formats
    const supportedFormats = [
      'video/mp4', 
      'video/quicktime', 
      'video/x-msvideo',
      'video/x-ms-wmv',
      'video/mpeg'
    ];
    if (video.mime_type && !supportedFormats.includes(video.mime_type)) {
      errors.push(`Video format may not be supported (got ${video.mime_type}). Recommended: MP4, MOV`);
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
  
  /**
   * Get Facebook video requirements
   * @returns {Object} Requirements
   */
  getRequirements() {
    return {
      maxDuration: 14400, // 240 minutes in seconds
      minDuration: null,
      maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB
      supportedFormats: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv', 'video/mpeg'],
      maxCaptionLength: 63206 // Very generous caption limit
    };
  }
  
  /**
   * Get Facebook Page ID and access token
   * @param {Object} account - Account with decrypted user token
   * @returns {Object} { pageId, pageAccessToken }
   */
  async getPageCredentials(account) {
    const url = `${this.apiBaseUrl}/me/accounts`;
    const params = new URLSearchParams({
      fields: 'id,name,access_token',
      access_token: account.access_token
    });
    
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || 'Failed to get Facebook Pages');
    }
    
    if (!data.data || data.data.length === 0) {
      throw new Error('No Facebook Pages found. User must have a Facebook Page to post videos.');
    }
    
    // Use the first page (could be enhanced to let user choose)
    const page = data.data[0];
    console.log(`[Facebook] Using Page: ${page.name} (${page.id})`);
    
    return {
      pageId: page.id,
      pageAccessToken: page.access_token, // Page-specific token
      pageName: page.name
    };
  }
  
  /**
   * Post video to Facebook Page
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
      
      // Get Page credentials
      console.log(`[Facebook] Getting Page credentials...`);
      const pageCredentials = await this.getPageCredentials(account);
      
      // Post video to Page
      console.log(`[Facebook] Posting video to Page ${pageCredentials.pageName}...`);
      const postResult = await this.postVideoToPage(pageCredentials, post, video);
      
      return {
        success: true,
        platformPostId: postResult.id,
        platformPostUrl: `https://www.facebook.com/${postResult.id}`,
        metadata: {
          pageId: pageCredentials.pageId,
          pageName: pageCredentials.pageName,
          postedAt: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('[Facebook] Post failed:', error);
      return {
        success: false,
        error: error.message,
        code: error.code || 'POST_FAILED',
        metadata: error.details
      };
    }
  }
  
  /**
   * Post video to Facebook Page
   * @param {Object} pageCredentials - Page ID and access token
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {Object} Post result
   */
  async postVideoToPage(pageCredentials, post, video) {
    return this.retryWithBackoff(async () => {
      const url = `${this.apiBaseUrl}/${pageCredentials.pageId}/videos`;
      
      // Build form data with parameters
      const params = {
        file_url: video.url, // Use URL instead of uploading file
        access_token: pageCredentials.pageAccessToken
      };
      
      // Add description/caption if provided
      if (post.caption) {
        params.description = post.caption.substring(0, 63206); // Truncate to limit
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
      });
      
      const data = await response.json();
      
      if (!response.ok || data.error) {
        const error = new Error(data.error?.message || 'Failed to post video to Facebook Page');
        error.statusCode = response.status;
        error.code = data.error?.code;
        error.details = data.error;
        throw error;
      }
      
      return data;
    }, 'Post video to Facebook Page');
  }
}

module.exports = FacebookWorker;
