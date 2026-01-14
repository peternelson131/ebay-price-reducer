/**
 * Create eBay Offer
 * 
 * Story 2: Create an offer for an inventory item
 * 
 * An offer links an inventory item (SKU) to:
 * - Price
 * - Quantity
 * - Category
 * - Business policies (fulfillment, payment, return)
 * 
 * The offer must be published (Story 3) to become a live listing.
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default policy IDs (Pete's eBay account)
// These can be overridden per-request
const DEFAULT_POLICIES = {
  fulfillmentPolicyId: '107540197026',  // Flat:USPS First Class(Free),3 business days
  paymentPolicyId: '243561626026',       // eBay Managed Payments
  returnPolicyId: '243561625026'         // 30 days money back
};

// Common eBay category IDs (US site)
const CATEGORY_MAP = {
  'toys': '220',              // Toys & Hobbies
  'building_toys': '19006',   // Building Toys
  'video_games': '139973',    // Video Games
  'electronics': '293',       // Consumer Electronics
  'books': '267',             // Books & Magazines
  'movies': '11232',          // DVDs & Blu-ray
  'music': '11233',           // Music
  'collectibles': '1',        // Collectibles
  'clothing': '11450',        // Clothing, Shoes & Accessories
  'home': '11700',            // Home & Garden
  'default': '220'            // Default to Toys & Hobbies
};

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('📋 create-ebay-offer called');

    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse request
    const {
      sku,
      price,
      quantity = 1,
      categoryId,
      categoryHint,  // e.g., 'toys', 'video_games' - will map to category ID
      fulfillmentPolicyId = DEFAULT_POLICIES.fulfillmentPolicyId,
      paymentPolicyId = DEFAULT_POLICIES.paymentPolicyId,
      returnPolicyId = DEFAULT_POLICIES.returnPolicyId,
      listingDescription  // Optional: override the inventory item description
    } = JSON.parse(event.body);

    // Validate required fields
    if (!sku) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'SKU is required' })
      };
    }

    if (!price || isNaN(parseFloat(price)) || parseFloat(price) <= 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid price is required' })
      };
    }

    // Determine category ID
    let finalCategoryId = categoryId;
    if (!finalCategoryId && categoryHint) {
      finalCategoryId = CATEGORY_MAP[categoryHint.toLowerCase()] || CATEGORY_MAP.default;
    }
    if (!finalCategoryId) {
      finalCategoryId = CATEGORY_MAP.default;
    }

    console.log(`📝 Creating offer for SKU: ${sku}`);
    console.log(`   Price: $${price}, Quantity: ${quantity}`);
    console.log(`   Category: ${finalCategoryId}`);

    // 3. Get valid eBay access token
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 4. Build offer payload
    const offerPayload = {
      sku: sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: quantity,
      categoryId: finalCategoryId,
      listingPolicies: {
        fulfillmentPolicyId: fulfillmentPolicyId,
        paymentPolicyId: paymentPolicyId,
        returnPolicyId: returnPolicyId
      },
      pricingSummary: {
        price: {
          currency: 'USD',
          value: parseFloat(price).toFixed(2)
        }
      },
      // Use seller's primary warehouse location (has full address)
      merchantLocationKey: 'loc-94e1f3a0-6e1b-4d23-befc-750fe183'
    };

    // Add listing description if provided
    if (listingDescription) {
      offerPayload.listingDescription = listingDescription;
    }

    // 5. Check if offer already exists for this SKU
    console.log('🔍 Checking if offer already exists...');
    let existingOfferId = null;
    
    try {
      const existingOffers = await ebayApiRequest(
        accessToken,
        `/sell/inventory/v1/offer?sku=${encodeURIComponent(sku)}`,
        { method: 'GET' }
      );
      
      if (existingOffers.offers && existingOffers.offers.length > 0) {
        existingOfferId = existingOffers.offers[0].offerId;
        console.log(`   Found existing offer: ${existingOfferId}`);
      }
    } catch (e) {
      // No existing offers, that's fine
      console.log('   No existing offer found');
    }

    let result;
    
    if (existingOfferId) {
      // UPDATE existing offer
      console.log('📤 Updating existing offer via eBay API...');
      result = await ebayApiRequest(
        accessToken,
        `/sell/inventory/v1/offer/${existingOfferId}`,
        {
          method: 'PUT',
          body: JSON.stringify(offerPayload)
        }
      );
      result.offerId = existingOfferId; // PUT doesn't return offerId
      console.log('✅ Offer UPDATED successfully');
    } else {
      // CREATE new offer
      console.log('📤 Creating new offer via eBay API...');
      result = await ebayApiRequest(
        accessToken,
        '/sell/inventory/v1/offer',
        {
          method: 'POST',
          body: JSON.stringify(offerPayload)
        }
      );
      console.log('✅ Offer CREATED successfully');
    }
    
    console.log(`   Offer ID: ${result.offerId}`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        offerId: result.offerId,
        sku: sku,
        price: price,
        quantity: quantity,
        categoryId: finalCategoryId,
        updated: !!existingOfferId,
        message: existingOfferId 
          ? 'Offer updated successfully. Use publish-ebay-offer to make it live.'
          : 'Offer created successfully. Use publish-ebay-offer to make it live.'
      })
    };

  } catch (error) {
    console.error('❌ Error creating offer:', error);

    // Parse eBay API errors for better messages
    let errorMessage = error.message;
    let errorDetails = null;

    // Try to extract more helpful error info
    if (error.message.includes('eBay API error')) {
      errorMessage = error.message;
      
      // Common errors and fixes
      if (error.message.includes('merchantLocationKey')) {
        errorDetails = 'No merchant location configured. Set up a location in eBay Seller Hub.';
      } else if (error.message.includes('categoryId')) {
        errorDetails = 'Invalid category ID. Check eBay category tree for valid IDs.';
      } else if (error.message.includes('policy')) {
        errorDetails = 'Invalid policy ID. Verify fulfillment/payment/return policy IDs.';
      }
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create offer',
        message: errorMessage,
        details: errorDetails
      })
    };
  }
};
