const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * User-specific eBay API Client
 * Handles eBay API calls using user's own tokens
 */
class UserEbayClient {
  constructor(userId) {
    this.userId = userId;
    this.accessToken = null;
    this.ebayUserId = null;
  }

  /**
   * Initialize client with user's eBay credentials
   */
  async initialize() {
    try {
      const { data, error } = await supabase.rpc('get_user_ebay_credentials', {
        user_uuid: this.userId
      });

      if (error) {
        throw new Error(`Failed to get eBay credentials: ${error.message}`);
      }

      if (!data || data.length === 0 || !data[0].access_token) {
        throw new Error('User has not connected their eBay account');
      }

      const credentials = data[0];

      // Check if token is expired
      if (credentials.expires_at && new Date(credentials.expires_at) <= new Date()) {
        // Try to refresh the token
        const refreshResult = await this.refreshToken();
        if (!refreshResult) {
          throw new Error('eBay token expired and refresh failed');
        }
      } else {
        this.accessToken = credentials.access_token;
        this.ebayUserId = credentials.ebay_user_id;
      }

      return true;
    } catch (error) {
      console.error('Error initializing eBay client:', error);
      throw error;
    }
  }

  /**
   * Refresh the user's eBay access token
   */
  async refreshToken() {
    try {
      const { data: credentials } = await supabase.rpc('get_user_ebay_credentials', {
        user_uuid: this.userId
      });

      if (!credentials || !credentials[0]?.refresh_token) {
        return false;
      }

      const refreshToken = credentials[0].refresh_token;
      const clientId = process.env.EBAY_APP_ID;
      const clientSecret = process.env.EBAY_CERT_ID;

      const credentialsBase64 = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentialsBase64}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Token refresh failed:', data);
        return false;
      }

      // Update token in database
      await supabase.rpc('update_user_ebay_token', {
        user_uuid: this.userId,
        access_token: data.access_token,
        expires_in: data.expires_in
      });

      this.accessToken = data.access_token;
      return true;

    } catch (error) {
      console.error('Error refreshing token:', error);
      return false;
    }
  }

  /**
   * Make authenticated eBay API call
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiType = 'trading') {
    if (!this.accessToken) {
      throw new Error('eBay client not initialized. Call initialize() first.');
    }

    const baseUrls = {
      trading: 'https://api.ebay.com/ws/api.dll',
      finding: 'https://svcs.ebay.com/services/search/FindingService/v1',
      sell: 'https://api.ebay.com/sell'
    };

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.accessToken}`
    };

    // Add API-specific headers
    if (apiType === 'trading') {
      headers['X-EBAY-API-SITEID'] = '0';
      headers['X-EBAY-API-COMPATIBILITY-LEVEL'] = '967';
      headers['X-EBAY-API-CALL-NAME'] = endpoint;
    }

    try {
      const startTime = Date.now();
      const url = apiType === 'trading' ? baseUrls.trading : `${baseUrls[apiType]}${endpoint}`;

      const response = await fetch(url, {
        method,
        headers,
        body: data ? JSON.stringify(data) : undefined
      });

      const responseTime = Date.now() - startTime;
      const responseData = await response.json();

      // Log API call for monitoring
      await this.logApiCall(endpoint, method, response.status, responseTime,
                           response.ok ? null : responseData.error?.message);

      if (!response.ok) {
        throw new Error(`eBay API Error: ${responseData.error?.message || 'Unknown error'}`);
      }

      return responseData;

    } catch (error) {
      console.error(`eBay API call failed (${endpoint}):`, error);
      throw error;
    }
  }

  /**
   * Get user's active listings
   */
  async getActiveListings(page = 1, limit = 50) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Pagination: {
        EntriesPerPage: limit,
        PageNumber: page
      },
      DetailLevel: 'ReturnAll',
      StartTimeFrom: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // Last 90 days
      StartTimeTo: new Date().toISOString()
    };

    return await this.makeApiCall('GetMyeBaySelling', 'POST', requestData, 'trading');
  }

  /**
   * Get specific item details
   */
  async getItemDetails(itemId) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      DetailLevel: 'ReturnAll'
    };

    return await this.makeApiCall('GetItem', 'POST', requestData, 'trading');
  }

  /**
   * Update item price
   */
  async updateItemPrice(itemId, newPrice) {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      Item: {
        ItemID: itemId,
        StartPrice: newPrice
      }
    };

    return await this.makeApiCall('ReviseItem', 'POST', requestData, 'trading');
  }

  /**
   * End an eBay listing
   */
  async endListing(itemId, reason = 'NotAvailable') {
    const requestData = {
      RequesterCredentials: {
        eBayAuthToken: this.accessToken
      },
      ItemID: itemId,
      EndingReason: reason
    };

    return await this.makeApiCall('EndItem', 'POST', requestData, 'trading');
  }

  /**
   * Search for similar items (for competitive pricing)
   */
  async searchSimilarItems(keywords, category = null, maxResults = 10) {
    const params = new URLSearchParams({
      'OPERATION-NAME': 'findItemsAdvanced',
      'SERVICE-VERSION': '1.0.0',
      'SECURITY-APPNAME': process.env.EBAY_APP_ID,
      'RESPONSE-DATA-FORMAT': 'JSON',
      'keywords': keywords,
      'paginationInput.entriesPerPage': maxResults.toString(),
      'sortOrder': 'PricePlusShipping'
    });

    if (category) {
      params.append('categoryId', category);
    }

    const url = `https://svcs.ebay.com/services/search/FindingService/v1?${params}`;

    try {
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error('Finding API call failed');
      }

      return data;

    } catch (error) {
      console.error('Error searching similar items:', error);
      throw error;
    }
  }

  /**
   * Log API call for monitoring and rate limiting
   */
  async logApiCall(endpoint, method, statusCode, responseTime, errorMessage = null) {
    try {
      await supabase
        .from('ebay_api_logs')
        .insert({
          user_id: this.userId,
          api_call: endpoint,
          endpoint: endpoint,
          method: method,
          status_code: statusCode,
          response_time_ms: responseTime,
          error_message: errorMessage
        });
    } catch (error) {
      console.error('Error logging API call:', error);
      // Don't throw error here to avoid breaking the main flow
    }
  }

  /**
   * Get user's API usage statistics
   */
  async getApiUsageStats(timeframe = '24h') {
    const timeframeMappings = {
      '1h': 1,
      '24h': 24,
      '7d': 24 * 7,
      '30d': 24 * 30
    };

    const hours = timeframeMappings[timeframe] || 24;
    const startTime = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      const { data, error } = await supabase
        .from('ebay_api_logs')
        .select('api_call, status_code, response_time_ms, created_at')
        .eq('user_id', this.userId)
        .gte('created_at', startTime.toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      const stats = {
        totalCalls: data.length,
        successfulCalls: data.filter(call => call.status_code >= 200 && call.status_code < 300).length,
        errorCalls: data.filter(call => call.status_code >= 400).length,
        averageResponseTime: data.length > 0 ?
          Math.round(data.reduce((sum, call) => sum + call.response_time_ms, 0) / data.length) : 0,
        callsByEndpoint: {}
      };

      // Group by endpoint
      data.forEach(call => {
        if (!stats.callsByEndpoint[call.api_call]) {
          stats.callsByEndpoint[call.api_call] = 0;
        }
        stats.callsByEndpoint[call.api_call]++;
      });

      return stats;

    } catch (error) {
      console.error('Error getting API usage stats:', error);
      throw error;
    }
  }

  /**
   * Check if user is within rate limits
   */
  async checkRateLimit() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    try {
      const { data, error } = await supabase
        .from('ebay_api_logs')
        .select('id')
        .eq('user_id', this.userId)
        .gte('created_at', oneHourAgo.toISOString());

      if (error) {
        throw error;
      }

      const callsInLastHour = data.length;
      const rateLimit = 5000; // eBay's typical hourly limit

      return {
        withinLimit: callsInLastHour < rateLimit,
        callsUsed: callsInLastHour,
        callsRemaining: Math.max(0, rateLimit - callsInLastHour),
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };

    } catch (error) {
      console.error('Error checking rate limit:', error);
      return {
        withinLimit: true,
        callsUsed: 0,
        callsRemaining: 5000,
        resetTime: new Date(Date.now() + 60 * 60 * 1000)
      };
    }
  }
}

module.exports = { UserEbayClient };