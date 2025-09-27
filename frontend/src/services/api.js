// API Service for eBay Price Reducer
// Connects frontend to Netlify Functions backend

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/.netlify/functions';

class ApiService {
  constructor() {
    this.baseURL = API_BASE_URL;
  }

  // Helper method for making requests
  async request(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
  }

  // Authentication & User Management
  async testEbayConnection() {
    return this.request('/test-ebay-connection', {
      method: 'GET'
    });
  }

  // Listings Management
  async getEbayListings(page = 1, limit = 100) {
    return this.request(`/get-ebay-listings?page=${page}&limit=${limit}`, {
      method: 'GET'
    });
  }

  async syncListings(userId) {
    return this.request('/sync-listings', {
      method: 'POST',
      body: JSON.stringify({ userId })
    });
  }

  async togglePriceReduction(itemId, userId, enabled) {
    return this.request('/toggle-price-reduction', {
      method: 'POST',
      body: JSON.stringify({ itemId, userId, enabled })
    });
  }

  async updateItemPrice(itemId, newPrice) {
    return this.request('/update-item-price', {
      method: 'POST',
      body: JSON.stringify({ itemId, newPrice })
    });
  }

  // Price Reduction Engine
  async runPriceReduction() {
    return this.request('/price-reduction-engine', {
      method: 'POST'
    });
  }

  // Market Analysis
  async analyzeMarket(itemId = null, keywords = null, categoryId = null) {
    return this.request('/market-analysis', {
      method: 'POST',
      body: JSON.stringify({ itemId, keywords, categoryId })
    });
  }

  // Notifications
  async sendNotification(userId, type, title, message, data = {}) {
    return this.request('/notification-service', {
      method: 'POST',
      body: JSON.stringify({ userId, type, title, message, data })
    });
  }

  // Scheduled Jobs (for admin/testing)
  async runScheduledJob(jobType = 'all') {
    return this.request(`/scheduled-jobs?job=${jobType}`, {
      method: 'POST'
    });
  }

  // Import existing listings (from the existing function)
  async importListings(userId, listings) {
    return this.request('/import-listings', {
      method: 'POST',
      body: JSON.stringify({ userId, listings })
    });
  }

  // Reduce specific price (from existing function)
  async reducePrice(itemId, userId, strategy = 'default') {
    return this.request('/reduce-price', {
      method: 'POST',
      body: JSON.stringify({ itemId, userId, strategy })
    });
  }

  // Monitor scheduled price reductions
  async monitorScheduledReductions() {
    return this.request('/scheduled-price-monitor', {
      method: 'GET'
    });
  }
}

// Create and export a singleton instance
const apiService = new ApiService();

// Export individual methods for easier importing
export const {
  testEbayConnection,
  getEbayListings,
  syncListings,
  togglePriceReduction,
  updateItemPrice,
  runPriceReduction,
  analyzeMarket,
  sendNotification,
  runScheduledJob,
  importListings,
  reducePrice,
  monitorScheduledReductions
} = apiService;

// Export the full service as default
export default apiService;

// Helper function to handle API errors consistently
export const handleApiError = (error, defaultMessage = 'An error occurred') => {
  console.error('API Error:', error);

  if (error.message) {
    return error.message;
  }

  return defaultMessage;
};

// Helper function to check if we're in demo mode
export const isDemoMode = () => {
  return !import.meta.env.VITE_SUPABASE_URL ||
         import.meta.env.VITE_SUPABASE_URL.includes('your-project-id');
};