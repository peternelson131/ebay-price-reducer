const crypto = require('crypto');

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

function decrypt(text) {
  const textParts = text.split(':');
  const iv = Buffer.from(textParts.shift(), 'hex');
  const encryptedText = Buffer.from(textParts.join(':'), 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
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
    console.error('Failed to get access token:', errorText);
    throw new Error('Failed to get access token from eBay');
  }

  const data = await response.json();
  return data.access_token;
}

// Fetch inventory items from eBay
async function fetchInventoryItems(accessToken, limit = 100, offset = 0) {
  console.log(`Fetching inventory items (limit: ${limit}, offset: ${offset})...`);

  const url = `https://api.ebay.com/sell/inventory/v1/inventory_item?limit=${limit}&offset=${offset}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch inventory items:', errorText);
    throw new Error('Failed to fetch inventory items from eBay');
  }

  return await response.json();
}

// Fetch offers for a specific SKU
async function fetchOffersForSku(accessToken, sku) {
  console.log(`Fetching offers for SKU: ${sku}`);

  const url = `https://api.ebay.com/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Failed to fetch offers for SKU ${sku}:`, errorText);
    // Return null instead of throwing to handle items without offers
    return null;
  }

  return await response.json();
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

    // Get user's eBay credentials and refresh token
    const users = await supabaseRequest(
      `users?id=eq.${authUser.id}`,
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
    const refreshToken = decrypt(user.ebay_refresh_token);

    // Get access token
    const accessToken = await getAccessToken(refreshToken, user.ebay_app_id, user.ebay_cert_id);

    // Fetch inventory items
    const inventoryData = await fetchInventoryItems(accessToken);

    const listings = [];

    // Process each inventory item
    if (inventoryData.inventoryItems && inventoryData.inventoryItems.length > 0) {
      for (const item of inventoryData.inventoryItems) {
        // Get offers for this SKU to get pricing and listing info
        const offersData = await fetchOffersForSku(accessToken, item.sku);

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

    console.log(`Fetched ${listings.length} listings from eBay`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        total: inventoryData.total || 0,
        listings: listings,
        hasMore: inventoryData.next ? true : false,
        nextOffset: inventoryData.next ? parseInt(inventoryData.next.split('offset=')[1]) : null
      })
    };

  } catch (error) {
    console.error('Error fetching eBay listings:', error);
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