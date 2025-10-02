const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Enhanced eBay API Client - Hybrid approach using both Trading and Inventory APIs
 *
 * This client orchestrates calls to multiple eBay APIs to gather comprehensive listing data:
 * - Inventory API: Primary source for listings, offers, pricing, quantity
 * - Trading API: Supplemental source for view counts, watch counts, and detailed stats
 *
 * The hybrid approach minimizes API calls while maximizing data completeness.
 */
class EnhancedEbayClient {
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
      console.error('Error initializing Enhanced eBay client:', error);
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
   * Fetch all listings with comprehensive data from both APIs
   * Returns unified listing objects with all available fields
   */
  async fetchAllListings(options = {}) {
    const {
      limit = 100,
      offset = 0,
      includeViewCounts = true,
      includeWatchCounts = true
    } = options;

    if (!this.accessToken) {
      throw new Error('Client not initialized. Call initialize() first.');
    }

    console.log('📦 Fetching comprehensive listing data...');

    // Step 1: Fetch inventory items (primary data source)
    const inventoryData = await this.fetchInventoryItems(limit, offset);

    if (!inventoryData || !inventoryData.inventoryItems) {
      return {
        listings: [],
        total: 0,
        hasMore: false
      };
    }

    // Step 2: Fetch offers for each inventory item
    const listingsWithOffers = await this.enrichWithOffers(inventoryData.inventoryItems);

    // Step 3: Fetch view/watch counts from Trading API (if requested)
    let listingsWithStats = listingsWithOffers;
    if (includeViewCounts || includeWatchCounts) {
      listingsWithStats = await this.enrichWithTradingApiStats(
        listingsWithOffers,
        { includeViewCounts, includeWatchCounts }
      );
    }

    // Step 4: Map to unified schema
    const unifiedListings = listingsWithStats.map(listing => this.mapToUnifiedSchema(listing));

    return {
      listings: unifiedListings,
      total: inventoryData.total || unifiedListings.length,
      hasMore: inventoryData.total > (offset + limit),
      nextOffset: offset + limit
    };
  }

  /**
   * Fetch inventory items from eBay Inventory API
   */
  async fetchInventoryItems(limit = 100, offset = 0) {
    const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch inventory items:', errorText);
        throw new Error('Failed to fetch inventory items from eBay');
      }

      const data = await response.json();
      console.log(`✅ Fetched ${data.inventoryItems?.length || 0} inventory items`);

      return data;
    } catch (error) {
      console.error('Error fetching inventory items:', error);
      throw error;
    }
  }

  /**
   * Enrich inventory items with offer data
   */
  async enrichWithOffers(inventoryItems) {
    console.log('🔄 Enriching with offer data...');

    const enrichedListings = [];

    for (const item of inventoryItems) {
      try {
        const offers = await this.fetchOffersForSku(item.sku);

        enrichedListings.push({
          ...item,
          offers: offers?.offers || [],
          primaryOffer: offers?.offers?.[0] || null
        });

        // Rate limiting delay (200ms between requests)
        await this.delay(200);
      } catch (error) {
        console.warn(`⚠️ Failed to fetch offers for SKU ${item.sku}:`, error.message);
        enrichedListings.push({
          ...item,
          offers: [],
          primaryOffer: null
        });
      }
    }

    console.log(`✅ Enriched ${enrichedListings.length} listings with offer data`);
    return enrichedListings;
  }

  /**
   * Fetch offers for a specific SKU
   */
  async fetchOffersForSku(sku) {
    const url = `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        return { offers: [] };
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.warn(`Failed to fetch offers for SKU ${sku}:`, error.message);
      return { offers: [] };
    }
  }

  /**
   * Enrich listings with view counts and watch counts from Trading API
   * Uses batch fetching to minimize API calls
   */
  async enrichWithTradingApiStats(listings, options = {}) {
    const { includeViewCounts = true, includeWatchCounts = true } = options;

    console.log('📊 Enriching with Trading API stats (view/watch counts)...');

    // Extract listing IDs from offers
    const listingIds = listings
      .map(l => l.primaryOffer?.listingId)
      .filter(id => id);

    if (listingIds.length === 0) {
      console.log('⚠️ No listing IDs found in offers, skipping Trading API enrichment');
      return listings;
    }

    // Fetch stats from Trading API (GetMyeBaySelling returns all active listings with stats)
    const tradingApiStats = await this.fetchTradingApiStats();

    // Create lookup map: listingId -> stats
    const statsMap = new Map();
    if (tradingApiStats && tradingApiStats.items) {
      tradingApiStats.items.forEach(item => {
        statsMap.set(item.itemId, {
          viewCount: item.viewCount || 0,
          watchCount: item.watchCount || 0,
          hitCount: item.hitCount || 0
        });
      });
    }

    // Enrich listings with stats
    const enrichedListings = listings.map(listing => {
      const listingId = listing.primaryOffer?.listingId;
      const stats = listingId ? statsMap.get(listingId) : null;

      return {
        ...listing,
        viewCount: stats?.viewCount || 0,
        watchCount: stats?.watchCount || 0,
        hitCount: stats?.hitCount || 0
      };
    });

    console.log(`✅ Enriched ${enrichedListings.length} listings with Trading API stats`);
    return enrichedListings;
  }

  /**
   * Fetch stats from Trading API (GetMyeBaySelling)
   * This returns active listings with view counts and watch counts
   */
  async fetchTradingApiStats() {
    const url = 'https://api.ebay.com/ws/api.dll';

    const xmlBody = `<?xml version="1.0" encoding="utf-8"?>
      <GetMyeBaySellingRequest xmlns="urn:ebay:apis:eBLBaseComponents">
        <RequesterCredentials>
          <eBayAuthToken>${this.accessToken}</eBayAuthToken>
        </RequesterCredentials>
        <ActiveList>
          <Include>true</Include>
          <Pagination>
            <EntriesPerPage>200</EntriesPerPage>
            <PageNumber>1</PageNumber>
          </Pagination>
        </ActiveList>
        <DetailLevel>ReturnAll</DetailLevel>
      </GetMyeBaySellingRequest>`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'X-EBAY-API-SITEID': '0',
          'X-EBAY-API-COMPATIBILITY-LEVEL': '967',
          'X-EBAY-API-CALL-NAME': 'GetMyeBaySelling',
          'Content-Type': 'text/xml',
          'X-EBAY-API-IAF-TOKEN': this.accessToken
        },
        body: xmlBody
      });

      if (!response.ok) {
        console.error('Trading API call failed:', response.status);
        return { items: [] };
      }

      const xmlText = await response.text();
      const parsedData = await this.parseXmlResponse(xmlText);

      // Extract items with stats
      const items = this.extractItemsFromTradingResponse(parsedData);

      console.log(`✅ Fetched stats for ${items.length} listings from Trading API`);
      return { items };
    } catch (error) {
      console.error('Error fetching Trading API stats:', error);
      return { items: [] };
    }
  }

  /**
   * Parse XML response from Trading API
   */
  async parseXmlResponse(xmlText) {
    const xml2js = require('xml2js');
    const parser = new xml2js.Parser({
      explicitArray: false,
      ignoreAttrs: false,
      tagNameProcessors: [xml2js.processors.stripPrefix]
    });

    try {
      return await parser.parseStringPromise(xmlText);
    } catch (error) {
      console.error('Error parsing XML:', error);
      return {};
    }
  }

  /**
   * Extract items with stats from Trading API response
   */
  extractItemsFromTradingResponse(parsedXml) {
    try {
      const response = parsedXml?.GetMyeBaySellingResponse;
      const activeList = response?.ActiveList;

      if (!activeList || !activeList.ItemArray) {
        return [];
      }

      // Handle both single item and array of items
      const items = Array.isArray(activeList.ItemArray.Item)
        ? activeList.ItemArray.Item
        : [activeList.ItemArray.Item];

      return items.map(item => ({
        itemId: item.ItemID,
        viewCount: parseInt(item.HitCount) || 0,
        watchCount: parseInt(item.WatchCount) || 0,
        hitCount: parseInt(item.HitCount) || 0,
        title: item.Title,
        listingUrl: item.ListingDetails?.ViewItemURL
      }));
    } catch (error) {
      console.error('Error extracting items from Trading response:', error);
      return [];
    }
  }

  /**
   * Map enriched listing data to unified database schema
   */
  mapToUnifiedSchema(listing) {
    const offer = listing.primaryOffer;

    return {
      // Core identifiers
      sku: listing.sku,
      ebay_item_id: offer?.listingId || null,

      // Product info
      title: listing.product?.title || '',
      description: listing.product?.description || '',

      // Pricing
      current_price: offer?.pricingSummary?.price?.value || 0,
      currency: offer?.pricingSummary?.price?.currency || 'USD',
      original_price: offer?.pricingSummary?.originalRetailPrice?.value || offer?.pricingSummary?.price?.value || 0,

      // Inventory
      quantity: offer?.availableQuantity || listing.availability?.shipToLocationAvailability?.quantity || 0,

      // Category
      category_id: offer?.categoryId || null,
      category_name: null, // Not provided by Inventory API

      // Images
      image_urls: listing.product?.imageUrls || [],

      // Listing details
      listing_type: offer?.format || 'FIXED_PRICE',
      listing_url: offer?.listing?.listingId ? `https://www.ebay.com/itm/${offer.listing.listingId}` : null,

      // Stats (from Trading API)
      view_count: listing.viewCount || 0,
      watch_count: listing.watchCount || 0,
      hit_count: listing.hitCount || 0,

      // Status
      status: offer?.status || 'PUBLISHED',
      listing_status: this.mapOfferStatusToListingStatus(offer?.status),

      // Timestamps
      start_time: offer?.listing?.listingStartDate || null,
      end_time: offer?.listing?.listingEndDate || null,

      // Sync metadata
      last_synced_at: new Date().toISOString()
    };
  }

  /**
   * Map eBay offer status to our listing status
   */
  mapOfferStatusToListingStatus(offerStatus) {
    const statusMap = {
      'PUBLISHED': 'Active',
      'UNPUBLISHED': 'Draft',
      'ENDED': 'Ended',
      'INACTIVE': 'Inactive'
    };
    return statusMap[offerStatus] || 'Unknown';
  }

  /**
   * Utility: Delay execution
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { EnhancedEbayClient };
