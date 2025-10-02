const crypto = require('crypto');

// Memory cache for responses (survives during function execution)
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const REQUEST_DELAY = 200; // 200ms delay between offer requests

// Request deduplication map
const pendingRequests = new Map();

// Helper function for delays
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to create cache key
const createCacheKey = (userId, type, identifier = '') => {
  return `${userId}_${type}_${identifier}`;
};

// Helper function to get from cache
const getFromCache = (key) => {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`✅ Cache hit for key: ${key}`);
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired cache
  }
  return null;
};

// Helper function to set cache
const setCache = (key, data) => {
  console.log(`💾 Caching data for key: ${key}`);
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
};

// Exponential backoff helper
const exponentialBackoff = async (attempt, maxRetries = 3) => {
  if (attempt >= maxRetries) {
    throw new Error('Max retries exceeded');
  }
  const backoffTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
  console.log(`⏳ Backing off for ${backoffTime}ms (attempt ${attempt + 1})`);
  await delay(backoffTime);
};

// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Encryption helpers for refresh token
const getEncryptionKey = () => {
  if (process.env.ENCRYPTION_KEY) {
    const key = process.env.ENCRYPTION_KEY;
    if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
      return Buffer.from(key, 'hex');
    }
    return crypto.createHash('sha256').update(key).digest();
  }
  const seed = process.env.SUPABASE_URL || 'default-seed';
  return crypto.createHash('sha256').update(seed).digest();
};

const ENCRYPTION_KEY = getEncryptionKey();
const IV_LENGTH = 16;

function decrypt(encryptedData) {
  try {
    // Handle both object format and string format
    if (typeof encryptedData === 'object' && encryptedData !== null) {
      // Object format: {iv: '...', encrypted: '...'}
      if (encryptedData.iv && encryptedData.encrypted) {
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const encryptedText = Buffer.from(encryptedData.encrypted, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
      }
      throw new Error('Invalid encrypted object format');
    } else if (typeof encryptedData === 'string') {
      // String format: 'iv:encryptedText'
      const textParts = encryptedData.split(':');
      if (textParts.length < 2) {
        // Maybe it's not encrypted at all (for testing)
        console.warn('Warning: Token appears to be unencrypted');
        return encryptedData;
      }
      const iv = Buffer.from(textParts.shift(), 'hex');
      const encryptedText = Buffer.from(textParts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } else {
      throw new Error(`Unexpected encrypted data type: ${typeof encryptedData}`);
    }
  } catch (error) {
    console.error('Decryption error:', error.message);
    console.error('Encrypted data type:', typeof encryptedData);
    if (encryptedData) {
      console.error('Encrypted data sample:', JSON.stringify(encryptedData).substring(0, 100));
    }
    throw new Error(`Failed to decrypt: ${error.message}`);
  }
}

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}, useServiceKey = false) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const apiKey = useServiceKey && SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;

  const options = {
    method,
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status} - ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// Helper function to get authenticated user
async function getAuthUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('Auth failed: No bearer token in header');
    return null;
  }

  const token = authHeader.substring(7);

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      console.log('Supabase auth failed');
      return null;
    }

    const user = await response.json();
    return user;
  } catch (error) {
    console.error('Error validating token:', error);
    return null;
  }
}

// Helper function to get access token from refresh token
async function getAccessToken(refreshToken, appId, certId) {
  console.log('Getting access token from refresh token...');

  const tokenUrl = 'https://api.ebay.com/identity/v1/oauth2/token';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'https://api.ebay.com/oauth/api_scope https://api.ebay.com/oauth/api_scope/sell.marketing.readonly https://api.ebay.com/oauth/api_scope/sell.marketing https://api.ebay.com/oauth/api_scope/sell.inventory.readonly https://api.ebay.com/oauth/api_scope/sell.inventory https://api.ebay.com/oauth/api_scope/sell.account.readonly https://api.ebay.com/oauth/api_scope/sell.account https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly https://api.ebay.com/oauth/api_scope/sell.fulfillment https://api.ebay.com/oauth/api_scope/sell.analytics.readonly'
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(`${appId}:${certId}`).toString('base64')
    },
    body: params
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to get access token. Status:', response.status);
    console.error('Error response:', errorText);

    let errorObj;
    try {
      errorObj = JSON.parse(errorText);
    } catch (e) {
      errorObj = { error: errorText };
    }

    // Check for specific eBay OAuth errors
    if (response.status === 401 || errorObj.error === 'invalid_grant') {
      throw new Error('Failed to get access token: Refresh token expired or invalid');
    } else if (errorObj.error === 'invalid_client') {
      throw new Error('Failed to get access token: Invalid eBay app credentials');
    } else if (errorObj.error === 'insufficient_scope') {
      throw new Error('Failed to get access token: Insufficient permissions');
    }

    throw new Error(`Failed to get access token: ${errorObj.error_description || errorObj.error || 'Unknown error'}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch inventory items from eBay with caching and retry logic
async function fetchInventoryItems(accessToken, userId, limit = 100, offset = 0, attempt = 0) {
  const cacheKey = createCacheKey(userId, 'inventory', `${limit}_${offset}`);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  console.log(`🔄 Fetching inventory items (limit: ${limit}, offset: ${offset}, attempt: ${attempt + 1})...`);

  const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.status === 429 || response.status >= 500) {
      // Rate limited or server error - retry with backoff
      if (attempt < 3) {
        await exponentialBackoff(attempt);
        return fetchInventoryItems(accessToken, userId, limit, offset, attempt + 1);
      }
      throw new Error('eBay service temporarily unavailable. Please try again later.');
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Failed to fetch inventory items:', errorText);
      throw new Error('Failed to fetch inventory items from eBay');
    }

    const data = await response.json();

    // Cache successful response
    setCache(cacheKey, data);

    return data;
  } catch (error) {
    if (attempt < 3 && (error.message.includes('timeout') || error.message.includes('ECONNRESET'))) {
      await exponentialBackoff(attempt);
      return fetchInventoryItems(accessToken, userId, limit, offset, attempt + 1);
    }
    throw error;
  }
}

// Fetch offers for a specific SKU with caching and rate limiting
async function fetchOffersForSku(accessToken, userId, sku, attempt = 0) {
  const cacheKey = createCacheKey(userId, 'offers', sku);

  // Check cache first
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  console.log(`🔄 Fetching offers for SKU: ${sku} (attempt: ${attempt + 1})`);

  // Add delay to respect rate limits
  if (attempt === 0) {
    await delay(REQUEST_DELAY);
  }

  const url = `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;

  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.status === 429 || response.status >= 500) {
      // Rate limited or server error - retry with backoff
      if (attempt < 3) {
        await exponentialBackoff(attempt);
        return fetchOffersForSku(accessToken, userId, sku, attempt + 1);
      }
      console.warn(`⚠️ Max retries exceeded for SKU ${sku}, returning null`);
      return null;
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch offers for SKU ${sku}:`, errorText);
      // Cache null result to avoid repeated failures
      setCache(cacheKey, null);
      return null;
    }

    const data = await response.json();

    // Cache successful response
    setCache(cacheKey, data);

    return data;
  } catch (error) {
    if (attempt < 3 && (error.message.includes('timeout') || error.message.includes('ECONNRESET'))) {
      await exponentialBackoff(attempt);
      return fetchOffersForSku(accessToken, userId, sku, attempt + 1);
    }
    console.warn(`⚠️ Error fetching offers for SKU ${sku}:`, error.message);
    return null;
  }
}

// Main handler
exports.handler = async (event, context) => {
  console.log('eBay Fetch Listings handler called');
  console.log('Method:', event.httpMethod);

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  try {
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);

    if (!authUser) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const userId = authUser.id;

    // Request deduplication - check if there's already a pending request for this user
    const requestKey = `fetch_listings_${userId}`;
    if (pendingRequests.has(requestKey)) {
      console.log(`🔄 Request already in progress for user ${userId}, waiting...`);
      return await pendingRequests.get(requestKey);
    }

    // Create promise for this request and store it
    const requestPromise = processEbayRequest(userId, authUser);
    pendingRequests.set(requestKey, requestPromise);

    try {
      const result = await requestPromise;
      return result;
    } finally {
      // Clean up pending request
      pendingRequests.delete(requestKey);
    }

  } catch (error) {
    console.error('Error in main handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch listings',
        message: error.message
      })
    };
  }
};

// Separate function to process eBay request
async function processEbayRequest(userId, authUser) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  try {
    // Check for cached full response first
    const fullCacheKey = createCacheKey(userId, 'full_listings');
    const cachedFullResponse = getFromCache(fullCacheKey);
    if (cachedFullResponse) {
      console.log('✅ Returning cached full response');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(cachedFullResponse)
      };
    }

    // Get user's eBay credentials and refresh token
    const users = await supabaseRequest(
      `users?id=eq.${userId}`,
      'GET',
      null,
      {},
      true // Use service key
    );

    if (!users || users.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    const user = users[0];

    // Check if user has eBay credentials
    if (!user.ebay_app_id || !user.ebay_cert_id || !user.ebay_refresh_token) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'eBay not connected',
          message: 'Please connect your eBay account first'
        })
      };
    }

    // Decrypt refresh token
    console.log('Decrypting refresh token...');
    let refreshToken;
    try {
      refreshToken = decrypt(user.ebay_refresh_token);
      console.log('Refresh token decrypted successfully');
    } catch (error) {
      console.error('Failed to decrypt refresh token:', error.message);
      throw new Error(`Failed to decrypt refresh token: ${error.message}`);
    }

    // Get access token
    const accessToken = await getAccessToken(refreshToken, user.ebay_app_id, user.ebay_cert_id);

    // Fetch inventory items with caching
    const inventoryData = await fetchInventoryItems(accessToken, userId);

    const listings = [];

    // Process each inventory item with rate limiting
    if (inventoryData.inventoryItems && inventoryData.inventoryItems.length > 0) {
      console.log(`📦 Processing ${inventoryData.inventoryItems.length} inventory items...`);

      for (let i = 0; i < inventoryData.inventoryItems.length; i++) {
        const item = inventoryData.inventoryItems[i];
        console.log(`Processing item ${i + 1}/${inventoryData.inventoryItems.length}: ${item.sku}`);

        // Get offers for this SKU with caching and rate limiting
        const offersData = await fetchOffersForSku(accessToken, userId, item.sku);

        // Map the data to match our database schema
        const listing = {
          // From Inventory API
          sku: item.sku,
          title: item.product?.title || 'No title',
          description: item.product?.description || '',
          quantity: item.availability?.shipToLocationAvailability?.quantity || 1,
          quantity_available: item.availability?.shipToLocationAvailability?.quantity || 1,
          image_urls: item.product?.imageUrls || [],
          condition: item.condition || 'Used',

          // Default values - will be populated from offers if available
          ebay_item_id: null,
          current_price: null,
          original_price: null,
          listing_status: 'Active',
          listing_format: 'FixedPriceItem',
          currency: 'USD',
          category: item.product?.aspects?.Category?.[0] || null,
          category_id: item.product?.categoryId || null,
          start_time: null,
          end_time: null,

          // Price reduction settings (defaults)
          price_reduction_enabled: false,
          reduction_strategy: 'fixed_percentage',
          reduction_percentage: 5,
          minimum_price: 0,
          reduction_interval: 7
        };

        // If we have offers, extract pricing and listing info
        if (offersData && offersData.offers && offersData.offers.length > 0) {
          // Take the first published offer (there might be multiple for different marketplaces)
          const offer = offersData.offers.find(o => o.status === 'PUBLISHED') || offersData.offers[0];

          const price = parseFloat(offer.pricingSummary?.price?.value || 0);
          listing.current_price = price;
          listing.original_price = price; // Set original price same as current on import
          listing.minimum_price = price * 0.5; // Default minimum to 50% of current price
          listing.ebay_item_id = offer.listingId || offer.offerId;
          listing.listing_status = offer.status === 'PUBLISHED' ? 'Active' : 'Ended';
          listing.currency = offer.pricingSummary?.price?.currency || 'USD';
          listing.start_time = offer.createdDate || new Date().toISOString();
          listing.listing_format = offer.format || 'FixedPriceItem';

          // Calculate listing age in days
          if (offer.createdDate) {
            const created = new Date(offer.createdDate);
            const now = new Date();
            const ageInDays = Math.floor((now - created) / (1000 * 60 * 60 * 24));
            listing.listing_age_days = ageInDays;
          }
        }

        listings.push(listing);
      }
    }

    console.log(`✅ Successfully fetched ${listings.length} listings from eBay`);

    const response = {
      success: true,
      total: inventoryData.total || 0,
      listings: listings,
      hasMore: inventoryData.next ? true : false,
      nextOffset: inventoryData.next ? parseInt(inventoryData.next.split('offset=')[1]) : null
    };

    // Cache the full response (reuse the same key from earlier)
    setCache(fullCacheKey, response);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('❌ Error processing eBay request:', error.message);
    console.error('Error stack:', error.stack);

    // Determine the specific error type and provide helpful message
    let statusCode = 500;
    let errorMessage = 'Failed to fetch listings';
    let userMessage = 'eBay service temporarily unavailable. Please try again later.';
    let errorDetails = {};

    if (error.message.includes('Failed to get access token')) {
      if (error.message.includes('expired or invalid')) {
        statusCode = 401;
        errorMessage = 'eBay authentication expired';
        userMessage = 'Your eBay connection has expired. Please reconnect your eBay account in Account settings.';
        errorDetails.needsReauth = true;
      } else {
        statusCode = 401;
        errorMessage = 'eBay authentication failed';
        userMessage = 'Unable to authenticate with eBay. Please check your eBay connection in Account settings.';
        errorDetails.authError = true;
      }
    } else if (error.message.includes('Failed to decrypt')) {
      statusCode = 500;
      errorMessage = 'Encryption error';
      userMessage = 'There was a problem accessing your eBay credentials. Please reconnect your eBay account in Account settings.';
      errorDetails.encryptionError = true;
    } else if (error.message.includes('Rate limit')) {
      statusCode = 429;
      errorMessage = 'Rate limited by eBay';
      userMessage = 'Too many requests to eBay. Please wait a moment and try again.';
      errorDetails.retryAfter = 60;
    } else if (error.message.includes('Cannot read properties')) {
      statusCode = 400;
      errorMessage = 'Configuration error';
      userMessage = 'eBay account not properly connected. Please connect your eBay account in Account settings.';
      errorDetails.configError = true;
    } else if (error.message.includes('Network') || error.message.includes('fetch')) {
      statusCode = 503;
      errorMessage = 'Network error';
      userMessage = 'Unable to connect to eBay. Please check your internet connection and try again.';
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({
        error: errorMessage,
        message: userMessage,
        details: {
          ...errorDetails,
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}