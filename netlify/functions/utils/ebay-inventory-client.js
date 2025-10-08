const fetch = require('node-fetch');
const { EbayTokenService } = require('./ebay-token-service');

class EbayInventoryClient {
  constructor(userId) {
    this.userId = userId;
    this.tokenService = new EbayTokenService(userId);
    this.accessToken = null;
  }

  /**
   * Initialize client by getting access token
   */
  async initialize() {
    this.accessToken = await this.tokenService.getAccessToken();
  }

  /**
   * Make API call to eBay REST endpoints with retry logic
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiFamily = 'inventory', attempt = 0) {
    const MAX_RETRIES = 3;

    if (!this.accessToken) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    const baseUrls = {
      inventory: 'https://api.ebay.com/sell/inventory/v1',
      account: 'https://api.ebay.com/sell/account/v1',
      taxonomy: 'https://api.ebay.com/commerce/taxonomy/v1'
    };

    const url = `${baseUrls[apiFamily]}${endpoint}`;

    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Content-Language': 'en-US',
        'Accept': 'application/json'
      }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);

      // Retry on rate limit or server error
      if ((response.status === 429 || response.status >= 500) && attempt < MAX_RETRIES) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
        console.log(`⏳ Retrying after ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES}) - Status: ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.makeApiCall(endpoint, method, data, apiFamily, attempt + 1);
      }

      // Handle 204 No Content (successful PUT requests)
      if (response.status === 204) {
        return { success: true };
      }

      const responseData = await response.json();

      if (!response.ok) {
        const errorMsg = responseData.errors?.[0]?.message ||
                        responseData.error?.message ||
                        'Unknown eBay API error';

        console.error('❌ eBay API Error Response:', JSON.stringify(responseData, null, 2));

        const error = new Error(`eBay API Error (${response.status}): ${errorMsg}`);
        // Attach full eBay error response for debugging
        error.ebayErrorResponse = responseData;
        error.ebayStatusCode = response.status;
        throw error;
      }

      return responseData;

    } catch (error) {
      // Network error - retry
      if (attempt < MAX_RETRIES && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED')) {
        const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`⏳ Network error, retrying after ${backoffTime}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.makeApiCall(endpoint, method, data, apiFamily, attempt + 1);
      }

      console.error(`eBay API call failed (${method} ${endpoint}):`, error);
      throw error;
    }
  }

  // ============ TAXONOMY API ============

  /**
   * Get category suggestions based on product keywords/title
   */
  async getCategorySuggestions(query) {
    const endpoint = `/category_tree/0/get_category_suggestions?q=${encodeURIComponent(query)}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');
  }

  /**
   * Get required and recommended item aspects for a category
   */
  async getItemAspectsForCategory(categoryId) {
    const endpoint = `/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');
  }

  /**
   * Validate category and check if it's a leaf category
   */
  async validateCategory(categoryId) {
    const endpoint = `/category_tree/0/get_category_subtree?category_id=${categoryId}`;
    const data = await this.makeApiCall(endpoint, 'GET', null, 'taxonomy');

    const category = data.categorySubtree;

    if (category.childCategoryTreeNodes && category.childCategoryTreeNodes.length > 0) {
      throw new Error(`Category "${category.categoryName}" is not specific enough. Please select a subcategory.`);
    }

    return category;
  }

  /**
   * Get category aspects with database caching
   * @param {string} categoryId - eBay category ID
   * @param {boolean} forceRefresh - Force refresh from eBay API (skip cache)
   * @returns {Object} - { aspects: [], fromCache: boolean, lastFetched: timestamp }
   */
  async getCachedCategoryAspects(categoryId, forceRefresh = false) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!forceRefresh) {
      // Check cache first
      const { data: cached, error } = await supabase
        .from('ebay_category_aspects')
        .select('*')
        .eq('category_id', categoryId)
        .gt('expires_at', new Date().toISOString())  // Not expired
        .single();

      if (!error && cached) {
        console.log(`✓ Using cached aspects for category ${categoryId} (expires: ${cached.expires_at})`);
        return {
          aspects: cached.aspects.aspects || cached.aspects,  // Handle nested structure
          fromCache: true,
          lastFetched: cached.last_fetched_at
        };
      }
    }

    // Cache miss or force refresh - fetch from eBay API
    console.log(`⟳ Fetching fresh aspects from eBay API for category ${categoryId}`);
    const aspectsData = await this.getItemAspectsForCategory(categoryId);

    // Cache in database
    const requiredAspectNames = aspectsData.aspects
      ?.filter(a => a.aspectConstraint?.aspectRequired === true)
      .map(a => a.localizedAspectName) || [];

    await supabase
      .from('ebay_category_aspects')
      .upsert({
        category_id: categoryId,
        category_name: '',  // Will be updated by caller if available
        aspects: aspectsData,
        required_aspects: requiredAspectNames,
        last_fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()  // 7 days
      }, {
        onConflict: 'category_id'
      });

    console.log(`✓ Cached aspects for category ${categoryId} (expires in 7 days)`);

    return {
      aspects: aspectsData.aspects,
      fromCache: false,
      lastFetched: new Date().toISOString()
    };
  }

  /**
   * Update cached category name
   * @param {string} categoryId - eBay category ID
   * @param {string} categoryName - Category name
   */
  async updateCachedCategoryName(categoryId, categoryName) {
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await supabase
      .from('ebay_category_aspects')
      .update({ category_name: categoryName })
      .eq('category_id', categoryId);
  }

  // ============ ACCOUNT API (Business Policies) ============

  /**
   * Get user's fulfillment/shipping policies
   */
  async getFulfillmentPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/fulfillment_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  /**
   * Get user's payment policies
   */
  async getPaymentPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/payment_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  /**
   * Get user's return policies
   */
  async getReturnPolicies(marketplaceId = 'EBAY_US') {
    const endpoint = `/return_policy?marketplace_id=${marketplaceId}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'account');
  }

  // ============ INVENTORY API ============

  /**
   * Create or replace inventory item
   */
  async createOrReplaceInventoryItem(sku, itemData) {
    const endpoint = `/inventory_item/${sku}`;
    return await this.makeApiCall(endpoint, 'PUT', itemData, 'inventory');
  }

  /**
   * Get offers by SKU
   */
  async getOffersBySku(sku) {
    const endpoint = `/offer?sku=${encodeURIComponent(sku)}`;
    return await this.makeApiCall(endpoint, 'GET', null, 'inventory');
  }

  /**
   * Update existing offer
   */
  async updateOffer(offerId, offerData) {
    const endpoint = `/offer/${offerId}`;
    return await this.makeApiCall(endpoint, 'PUT', offerData, 'inventory');
  }

  /**
   * Create offer
   */
  async createOffer(offerData) {
    return await this.makeApiCall('/offer', 'POST', offerData, 'inventory');
  }

  /**
   * Publish offer to create live listing
   */
  async publishOffer(offerId) {
    const endpoint = `/offer/${offerId}/publish`;
    return await this.makeApiCall(endpoint, 'POST', {}, 'inventory');
  }

  /**
   * Get or create inventory location
   * Checks if location exists, creates if not found
   */
  async ensureInventoryLocation(merchantLocationKey, locationData) {
    try {
      // Try to get existing location
      const endpoint = `/location/${merchantLocationKey}`;
      await this.makeApiCall(endpoint, 'GET', null, 'inventory');
      console.log('✓ Inventory location already exists:', merchantLocationKey);
      return { exists: true, merchantLocationKey };
    } catch (error) {
      // Location doesn't exist, create it
      if (error.ebayStatusCode === 404) {
        console.log('Location not found, creating new location...');
        const endpoint = `/location/${merchantLocationKey}`;
        console.log('POST payload:', JSON.stringify(locationData, null, 2));
        const result = await this.makeApiCall(endpoint, 'POST', locationData, 'inventory');
        console.log('✓ Location created successfully:', result);
        return { exists: false, merchantLocationKey, created: true };
      } else {
        // Re-throw non-404 errors
        throw error;
      }
    }
  }
}

module.exports = { EbayInventoryClient };
