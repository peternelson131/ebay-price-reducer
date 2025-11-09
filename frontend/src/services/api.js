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
  sendNotification
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