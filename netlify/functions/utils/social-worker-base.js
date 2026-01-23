/**
 * Social Media Worker Base Class
 * 
 * Provides common functionality for all platform workers:
 * - Token refresh and management
 * - Retry logic with exponential backoff
 * - Error handling and standardization
 * - Rate limit handling
 * - Logging and telemetry
 */

const { createClient } = require('@supabase/supabase-js');
const { encryptToken, decryptToken } = require('./social-token-encryption');
const fetch = require('node-fetch');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

class SocialWorkerBase {
  /**
   * @param {string} platform - Platform name (instagram, youtube, etc.)
   * @param {Object} config - Platform-specific configuration
   */
  constructor(platform, config = {}) {
    this.platform = platform;
    this.config = config;
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Retry configuration
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000; // ms
    this.retryBackoffMultiplier = config.retryBackoffMultiplier || 2;
    
    // Rate limit configuration
    this.rateLimitRetryAfter = 60000; // 60 seconds default
  }
  
  /**
   * Get account for user and platform
   * @param {string} userId - User ID
   * @returns {Object} Account with decrypted tokens
   */
  async getAccount(userId) {
    const { data: account, error } = await this.supabase
      .from('social_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('platform', this.platform)
      .eq('is_active', true)
      .single();
    
    if (error || !account) {
      throw new Error(`No active ${this.platform} account found for user`);
    }
    
    // Check if token is expired
    if (account.token_expires_at) {
      const expiresAt = new Date(account.token_expires_at);
      const now = new Date();
      
      // Refresh if expired or expiring within 5 minutes
      if (expiresAt < new Date(now.getTime() + 5 * 60 * 1000)) {
        console.log(`Token expired/expiring for ${this.platform}, refreshing...`);
        account = await this.refreshToken(account);
      }
    }
    
    // Decrypt tokens
    try {
      account.access_token = decryptToken(account.access_token);
      if (account.refresh_token) {
        account.refresh_token = decryptToken(account.refresh_token);
      }
    } catch (error) {
      throw new Error(`Failed to decrypt tokens: ${error.message}`);
    }
    
    return account;
  }
  
  /**
   * Refresh access token using refresh token
   * @param {Object} account - Account object with encrypted tokens
   * @returns {Object} Updated account with new tokens
   */
  async refreshToken(account) {
    if (!account.refresh_token) {
      throw new Error(`No refresh token available for ${this.platform}`);
    }
    
    // Decrypt refresh token
    const refreshToken = decryptToken(account.refresh_token);
    
    // Platform-specific token refresh (override in subclass)
    const newTokens = await this.platformRefreshToken(refreshToken);
    
    if (!newTokens || !newTokens.access_token) {
      throw new Error('Token refresh failed');
    }
    
    // Encrypt new tokens
    const encryptedAccessToken = encryptToken(newTokens.access_token);
    const encryptedRefreshToken = newTokens.refresh_token 
      ? encryptToken(newTokens.refresh_token) 
      : account.refresh_token; // Keep old if not provided
    
    // Calculate new expiration
    const tokenExpiresAt = newTokens.expires_in
      ? new Date(Date.now() + newTokens.expires_in * 1000).toISOString()
      : null;
    
    // Update in database
    const { data: updatedAccount, error } = await this.supabase
      .from('social_accounts')
      .update({
        access_token: encryptedAccessToken,
        refresh_token: encryptedRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString()
      })
      .eq('id', account.id)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to update refreshed tokens: ${error.message}`);
    }
    
    return updatedAccount;
  }
  
  /**
   * Platform-specific token refresh (override in subclass)
   * @param {string} refreshToken - Decrypted refresh token
   * @returns {Object} New tokens { access_token, refresh_token?, expires_in? }
   */
  async platformRefreshToken(refreshToken) {
    throw new Error('platformRefreshToken() must be implemented by subclass');
  }
  
  /**
   * Retry wrapper with exponential backoff
   * @param {Function} fn - Async function to retry
   * @param {string} operationName - Name for logging
   * @returns {*} Function result
   */
  async retryWithBackoff(fn, operationName = 'operation') {
    let lastError;
    let delay = this.retryDelay;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }
        
        // Check if rate limited
        if (error.statusCode === 429 || error.message?.includes('rate limit')) {
          const retryAfter = error.retryAfter || this.rateLimitRetryAfter;
          console.warn(`Rate limited on ${operationName}, waiting ${retryAfter}ms`);
          await this.sleep(retryAfter);
          continue;
        }
        
        if (attempt < this.maxRetries) {
          console.warn(`${operationName} failed (attempt ${attempt}/${this.maxRetries}): ${error.message}`);
          console.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
          delay *= this.retryBackoffMultiplier;
        }
      }
    }
    
    throw new Error(`${operationName} failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }
  
  /**
   * Check if error should not be retried
   * @param {Error} error - Error object
   * @returns {boolean} True if should not retry
   */
  shouldNotRetry(error) {
    // Don't retry on 4xx errors (except 429 rate limit)
    if (error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
      return true;
    }
    
    // Don't retry on authentication errors
    if (error.message?.includes('authentication') || error.message?.includes('unauthorized')) {
      return true;
    }
    
    // Don't retry on invalid token errors
    if (error.message?.includes('invalid token') || error.message?.includes('token expired')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Sleep for specified milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise} Promise that resolves after delay
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Standardize error response
   * @param {Error} error - Original error
   * @param {string} operation - Operation that failed
   * @returns {Object} Standardized error object
   */
  standardizeError(error, operation = 'operation') {
    return {
      platform: this.platform,
      operation,
      message: error.message || 'Unknown error',
      code: error.code || error.statusCode || 'UNKNOWN_ERROR',
      details: error.details || error.response?.data || null,
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Post to platform (override in subclass)
   * @param {Object} account - Account with decrypted tokens
   * @param {Object} post - Post data
   * @param {Object} video - Video data
   * @returns {Object} Result { success, platformPostId?, platformPostUrl?, error? }
   */
  async postToplatform(account, post, video) {
    throw new Error('postToPlatform() must be implemented by subclass');
  }
  
  /**
   * Validate video for platform (override in subclass)
   * @param {Object} video - Video data
   * @returns {Object} Validation result { valid, errors? }
   */
  validateVideo(video) {
    return { valid: true };
  }
  
  /**
   * Get platform-specific post requirements (override in subclass)
   * @returns {Object} Requirements object
   */
  getRequirements() {
    return {
      maxDuration: null,
      maxFileSize: null,
      supportedFormats: [],
      maxCaptionLength: null
    };
  }
}

module.exports = SocialWorkerBase;
