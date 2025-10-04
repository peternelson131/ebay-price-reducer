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
   * Make API call to eBay REST endpoints
   */
  async makeApiCall(endpoint, method = 'GET', data = null, apiFamily = 'inventory') {
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
