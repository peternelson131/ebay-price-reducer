// API Service for eBay Price Reducer
// Connects frontend to Netlify Functions backend

import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Get authentication token from Supabase
  async getAuthToken() {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  }

  // Helper method for making requests with retry logic
  async request(endpoint, options = {}, retries = 3) {
    const url = `${this.baseURL}${endpoint}`;
    let lastError;

    // Get auth token
    const token = await this.getAuthToken();

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const config = {
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers,
          },
          ...options,
        };

        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
          // Don't retry client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
          }

          // Retry server errors (5xx) and network errors
          if (attempt < retries) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        return data;
      } catch (error) {
        lastError = error;

        // Don't retry on abort or client errors
        if (error.name === 'AbortError' || error.message.includes('HTTP error!')) {
          throw error;
        }

        // Retry network errors
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`API request failed, retrying in ${delay}ms...`, error);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    logger.error(`API Error for ${endpoint} after ${retries} retries:`, lastError);
    throw lastError;
  }

  // Generic HTTP methods
  async get(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'GET',
      ...options
    });
  }

  async post(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  }

  async put(endpoint, data = null, options = {}) {
    return this.request(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      ...options
    });
  }

  async delete(endpoint, options = {}) {
    return this.request(endpoint, {
      method: 'DELETE',
      ...options
    });
  }

  // Removed unused methods that called deleted backend functions:
  // - testEbayConnection, getEbayListings, syncListings
  // - togglePriceReduction, updateListingStrategy, updateItemPrice
  // - runPriceReduction, manualPriceReduction

  async getPriceChanges(days = 30, limit = 50) {
    return this.request(`/get-price-changes?days=${days}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async getPriceReductionLogs(days = 10, limit = 100, type = null) {
    const typeParam = type ? `&type=${type}` : '';
    return this.request(`/get-price-reduction-logs?days=${days}&limit=${limit}${typeParam}`, {
      method: 'GET'
    });
  }

  // Removed: analyzeMarket method (backend function deleted)

  // Notifications
  async sendNotification(userId, type, title, message, data = {}) {
    return this.request('/notification-service', {
      method: 'POST',
      body: JSON.stringify({ userId, type, title, message, data })
    });
  }

  // Removed unused methods that called deleted backend functions:
  // - runScheduledJob, importListings, reducePrice, monitorScheduledReductions
  // - getEbayAuthUrl, getEbayConnectionStatus, disconnectEbayAccount

  // ASIN Correlation Analysis (n8n integration)

  // Check if ASIN exists in database
  async checkAsinCorrelation(asin) {
    return this.request('/trigger-asin-correlation-v2', {
      method: 'POST',
      body: JSON.stringify({ asin, action: 'check' })
    });
  }

  // Sync ASIN - processes via serverless function (all logic in-app, no external n8n)
  async syncAsinCorrelation(asin) {
    return this.request('/trigger-asin-correlation-v2', {
      method: 'POST',
      body: JSON.stringify({ asin, action: 'sync' })
    });
  }

  // Legacy method for backwards compatibility
  async triggerAsinCorrelation(asin) {
    return this.checkAsinCorrelation(asin);
  }

  // ==================== BACKGROUND JOB API ====================
  // For processing large batches (50+ variations) without timeout

  // Start background correlation job (returns immediately, processes in background)
  async startCorrelationJob(asin) {
    return this.request('/asin-correlation-job', {
      method: 'POST',
      body: JSON.stringify({ action: 'start', asin })
    });
  }

  // Check status of a correlation job
  async getCorrelationJobStatus(jobId) {
    return this.request(`/asin-correlation-job?action=status&jobId=${jobId}`, {
      method: 'GET'
    });
  }

  // List recent correlation jobs
  async listCorrelationJobs(limit = 10) {
    return this.request(`/asin-correlation-job?action=list&limit=${limit}`, {
      method: 'GET'
    });
  }

  // Poll job until complete (with timeout)
  async waitForCorrelationJob(jobId, { 
    pollIntervalMs = 2000, 
    timeoutMs = 300000, // 5 minutes default
    onProgress = null 
  } = {}) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const result = await this.getCorrelationJobStatus(jobId);
      
      // Call progress callback if provided
      if (onProgress && result.job) {
        onProgress(result.job);
      }
      
      // Check if complete
      if (result.isComplete) {
        return result;
      }
      
      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
    
    throw new Error('Job timed out');
  }

  // Convenience method: start job and wait for completion
  async syncAsinCorrelationBackground(asin, options = {}) {
    // Start the job
    const startResult = await this.startCorrelationJob(asin);
    
    if (!startResult.success) {
      throw new Error(startResult.error || 'Failed to start job');
    }
    
    // If already running, just poll that job
    const jobId = startResult.jobId;
    
    // Wait for completion
    return this.waitForCorrelationJob(jobId, options);
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

// Export individual methods for easier importing
export const {
  get,
  post,
  put,
  delete: deleteMethod,
  getPriceChanges,
  getPriceReductionLogs,
  sendNotification,
  checkAsinCorrelation,
  syncAsinCorrelation,
  triggerAsinCorrelation,
  // Background job methods
  startCorrelationJob,
  getCorrelationJobStatus,
  listCorrelationJobs,
  waitForCorrelationJob,
  syncAsinCorrelationBackground
} = apiService;

// Export the full service as default
export default apiService;

// Helper function to handle API errors consistently
export const handleApiError = (error, defaultMessage = 'An error occurred') => {
  logger.error('API Error:', error);

  if (error.message) {
    return error.message;
  }

  return defaultMessage;
};

// Helper function to check if we're in demo mode
export const isDemoMode = () => {
  return import.meta.env.VITE_DEMO_MODE === 'true';
};
