const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const { EbayInventoryClient } = require('./utils/ebay-inventory-client');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

    // 2. Parse request body
    const listingData = JSON.parse(event.body);

    console.log('Creating eBay listing for user:', user.id, 'Data:', listingData);

    // 3. Validate required fields
    const requiredFields = ['title', 'description', 'price', 'quantity', 'images'];
    for (const field of requiredFields) {
      if (!listingData[field]) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: `Missing required field: ${field}`
          })
        };
      }
    }

    // 4. Initialize eBay client
    console.log('Step 4: Initializing eBay client for user:', user.id);
    const ebayClient = new EbayInventoryClient(user.id);
    await ebayClient.initialize();

    console.log('✓ eBay client initialized successfully');

    // 5. Get category suggestions from title
    let categoryId = listingData.categoryId;
    let categoryName = '';

    console.log('Step 5: Category detection - provided categoryId:', categoryId);
    if (!categoryId) {
      console.log('Step 5a: Auto-suggesting category from title:', listingData.title);
      const suggestions = await ebayClient.getCategorySuggestions(listingData.title);

      if (!suggestions.categorySuggestions || suggestions.categorySuggestions.length === 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Could not determine eBay category. Please try a more descriptive title.'
          })
        };
      }

      const bestMatch = suggestions.categorySuggestions[0];
      categoryId = bestMatch.category.categoryId;
      categoryName = bestMatch.category.categoryName;

      console.log(`Suggested category: ${categoryName} (${categoryId})`);
    }

    // 6. Get required item aspects for category
    console.log('Fetching item aspects for category:', categoryId);
    const aspectsData = await ebayClient.getItemAspectsForCategory(categoryId);
    const requiredAspects = aspectsData.aspects.filter(a =>
      a.aspectConstraint?.aspectRequired === true
    );

    console.log(`Found ${requiredAspects.length} required aspects`);

    // 7. Validate and fix user provided required aspects
    const providedAspects = listingData.aspects || {};

    // Fix Brand for LEGO categories (categoryName contains "LEGO")
    if (categoryName && categoryName.toUpperCase().includes('LEGO')) {
      if (providedAspects['Brand'] && !providedAspects['Brand'].includes('LEGO')) {
        console.log(`Fixing Brand from ${providedAspects['Brand']} to LEGO for LEGO category`);
        providedAspects['Brand'] = ['LEGO'];
      }
    }

    const missingAspects = [];

    for (const aspect of requiredAspects) {
      const aspectName = aspect.localizedAspectName;
      if (!providedAspects[aspectName] || providedAspects[aspectName].length === 0) {
        missingAspects.push({
          name: aspectName,
          constraint: aspect.aspectConstraint
        });
      }
    }

    if (missingAspects.length > 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required product aspects',
          missingAspects: missingAspects.map(a => a.name),
          categoryId,
          categoryName,
          allRequiredAspects: requiredAspects
        })
      };
    }

    // 7.5. Get user's default settings
    const { data: userData } = await supabase
      .from('users')
      .select('listing_settings')
      .eq('id', user.id)
      .single();

    const userSettings = userData?.listing_settings || {};

    // 8. Get user's business policies
    console.log('Fetching business policies');
    const [fulfillmentPolicies, paymentPolicies, returnPolicies] = await Promise.all([
      ebayClient.getFulfillmentPolicies('EBAY_US'),
      ebayClient.getPaymentPolicies('EBAY_US'),
      ebayClient.getReturnPolicies('EBAY_US')
    ]);

    // Check if user has policies
    if (!fulfillmentPolicies.fulfillmentPolicies?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'No shipping policies found. Please create business policies in your eBay account.',
          setupUrl: 'https://www.ebay.com/sh/mkt/businesspolicies'
        })
      };
    }

    if (!paymentPolicies.paymentPolicies?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'No payment policies found. Please create business policies in your eBay account.',
          setupUrl: 'https://www.ebay.com/sh/mkt/businesspolicies'
        })
      };
    }

    if (!returnPolicies.returnPolicies?.length) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'No return policies found. Please create business policies in your eBay account.',
          setupUrl: 'https://www.ebay.com/sh/mkt/businesspolicies'
        })
      };
    }

    // Use user's default policies or first available
    const fulfillmentPolicyId = listingData.fulfillmentPolicyId ||
                                 userSettings.defaultFulfillmentPolicyId ||
                                 fulfillmentPolicies.fulfillmentPolicies[0].fulfillmentPolicyId;
    const paymentPolicyId = listingData.paymentPolicyId ||
                           userSettings.defaultPaymentPolicyId ||
                           paymentPolicies.paymentPolicies[0].paymentPolicyId;
    const returnPolicyId = listingData.returnPolicyId ||
                          userSettings.defaultReturnPolicyId ||
                          returnPolicies.returnPolicies[0].returnPolicyId;

    console.log('Using policies:', { fulfillmentPolicyId, paymentPolicyId, returnPolicyId });

    // 9. Ensure inventory location exists
    // eBay has 36 char limit on merchantLocationKey
    const merchantLocationKey = `loc-${user.id.substring(0, 32)}`;
    const defaultLocation = listingData.location ||
                           userSettings.defaultLocation ||
                           {
                             addressLine1: '123 Main St',
                             city: 'San Francisco',
                             stateOrProvince: 'CA',
                             postalCode: '94105',
                             country: 'US'
                           };

    const locationPayload = {
      location: {
        address: defaultLocation
      },
      locationTypes: ['WAREHOUSE'],
      name: 'Primary Warehouse Location',
      phone: '555-555-5555'  // Required by eBay API
    };

    console.log('Step 9: Creating inventory location with payload:', JSON.stringify(locationPayload, null, 2));

    try {
      await ebayClient.ensureInventoryLocation(merchantLocationKey, locationPayload);
      console.log('✓ Step 9 complete: Inventory location ensured:', merchantLocationKey);
    } catch (error) {
      console.error('❌ Step 9 FAILED - Inventory location error:', error.message);
      console.error('Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      throw error;
    }

    // 10. Generate unique SKU
    const sku = listingData.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 11. Create inventory item
    console.log('Step 11: Creating inventory item with SKU:', sku);

    // Normalize condition to uppercase (eBay requires uppercase enum values)
    let condition = listingData.condition ||
                    userSettings.defaultCondition ||
                    'NEW_OTHER'; // Default: New Open Box

    // Map common condition values to eBay enum
    const conditionMap = {
      'new': 'NEW',
      'used': 'USED',
      'refurbished': 'REFURBISHED',
      'for parts': 'FOR_PARTS_OR_NOT_WORKING'
    };

    condition = conditionMap[condition.toLowerCase()] || condition.toUpperCase();

    const inventoryItemPayload = {
      availability: {
        shipToLocationAvailability: {
          quantity: parseInt(listingData.quantity)
        }
      },
      condition: condition,
      conditionDescription: listingData.conditionDescription || 'New item in opened packaging. All original accessories included.',
      product: {
        title: listingData.title.substring(0, 80), // eBay 80 char limit
        description: listingData.description,
        imageUrls: listingData.images.slice(0, 12), // eBay max 12 images
        aspects: providedAspects
      }
    };

    console.log('Inventory item payload:', JSON.stringify(inventoryItemPayload, null, 2));

    try {
      await ebayClient.createOrReplaceInventoryItem(sku, inventoryItemPayload);
      console.log('✓ Step 11 complete: Inventory item created');
    } catch (error) {
      console.error('❌ Step 11 FAILED - Create inventory item error:', error.message);
      console.error('eBay error response:', JSON.stringify(error.ebayErrorResponse, null, 2));
      // Return detailed error for debugging
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Step 11 Failed: Create Inventory Item',
          step: 11,
          message: error.message,
          ebayErrorResponse: error.ebayErrorResponse,
          payloadSent: inventoryItemPayload,
          sku: sku
        })
      };
    }

    // 12. Check for existing offer and create/update accordingly
    console.log('Step 12: Checking for existing offer for SKU:', sku);

    const offerPayload = {
      sku: sku,
      marketplaceId: 'EBAY_US',
      format: 'FIXED_PRICE',
      availableQuantity: parseInt(listingData.quantity),
      categoryId: categoryId,
      merchantLocationKey: merchantLocationKey,
      pricingSummary: {
        price: {
          value: parseFloat(listingData.price).toFixed(2),
          currency: 'USD'
        }
      },
      listingPolicies: {
        fulfillmentPolicyId: fulfillmentPolicyId,
        paymentPolicyId: paymentPolicyId,
        returnPolicyId: returnPolicyId
      }
    };

    let offerResponse;
    let existingOfferId = null;

    // Check if offer already exists for this SKU
    try {
      const existingOffers = await ebayClient.getOffersBySku(sku);
      if (existingOffers.offers && existingOffers.offers.length > 0) {
        existingOfferId = existingOffers.offers[0].offerId;
        console.log('Found existing offer:', existingOfferId);
      }
    } catch (error) {
      // If error getting offers, continue to create new
      console.log('No existing offers found, will create new');
    }

    console.log('Offer payload:', JSON.stringify(offerPayload, null, 2));

    try {
      if (existingOfferId) {
        console.log('Step 12a: Updating existing offer:', existingOfferId);
        offerResponse = await ebayClient.updateOffer(existingOfferId, offerPayload);
        offerResponse.offerId = existingOfferId;
        console.log('✓ Step 12 complete: Offer updated with ID:', existingOfferId);
      } else {
        console.log('Step 12b: Creating new offer');
        offerResponse = await ebayClient.createOffer(offerPayload);
        console.log('✓ Step 12 complete: Offer created with ID:', offerResponse.offerId);
      }
    } catch (error) {
      console.error('❌ Step 12 FAILED - Create/update offer error:', error.message);
      console.error('eBay error response:', JSON.stringify(error.ebayErrorResponse, null, 2));
      // Return detailed error for debugging
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Step 12 Failed: Create/Update Offer',
          step: 12,
          message: error.message,
          ebayErrorResponse: error.ebayErrorResponse,
          payloadSent: offerPayload,
          sku: sku,
          existingOfferId: existingOfferId
        })
      };
    }

    // 13. Publish offer (only if not already published)
    console.log('Step 13: Publishing offer ID:', offerResponse.offerId);
    let publishResponse;

    try {
      publishResponse = await ebayClient.publishOffer(offerResponse.offerId);
      console.log('Listing published:', publishResponse.listingId);
    } catch (error) {
      // If offer is already published, get the listing ID from the offer
      if (error.ebayStatusCode === 500 && error.message.includes('Product not found')) {
        console.log('Offer already published, retrieving existing listing ID...');
        const existingOffers = await ebayClient.getOffersBySku(sku);
        if (existingOffers.offers && existingOffers.offers.length > 0) {
          const offer = existingOffers.offers[0];
          publishResponse = {
            listingId: offer.listing?.listingId || offer.offerId,
            warnings: ['Offer was already published']
          };
          console.log('Using existing listing ID:', publishResponse.listingId);
        } else {
          throw error;
        }
      } else {
        throw error;
      }
    }

    // 14. Store listing in Supabase (upsert to handle duplicates)
    const listingPayload = {
      user_id: user.id,
      ebay_item_id: publishResponse.listingId,
      sku: sku,
      title: listingData.title.substring(0, 80),
      current_price: parseFloat(listingData.price),
      original_price: parseFloat(listingData.price),
      minimum_price: listingData.minimumPrice || parseFloat(listingData.price) * 0.5,
      quantity: parseInt(listingData.quantity),
      category_id: categoryId,
      category: categoryName,
      image_urls: listingData.images,
      listing_status: 'Active',
      start_time: new Date().toISOString()
    };

    const { data: listing, error: dbError } = await supabase
      .from('listings')
      .upsert(listingPayload, {
        onConflict: 'user_id,ebay_item_id',
        ignoreDuplicates: false
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database upsert error:', dbError);
      // Listing created on eBay but failed to save locally
      // Log for manual reconciliation
    }

    // 15. Return success response
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        wasUpdated: existingOfferId ? true : false,
        listingId: publishResponse.listingId,
        offerId: offerResponse.offerId,
        sku: sku,
        categoryId: categoryId,
        categoryName: categoryName,
        viewUrl: `https://www.ebay.com/itm/${publishResponse.listingId}`,
        listing: listing,
        warnings: publishResponse.warnings || [],
        message: existingOfferId
          ? `Listing updated successfully! Previously listed as ${publishResponse.listingId}`
          : 'New listing created successfully!'
      })
    };

  } catch (error) {
    console.error('Create listing error:', {
      message: error.message,
      stack: error.stack,
      ebayErrorResponse: error.ebayErrorResponse || null,
      ebayStatusCode: error.ebayStatusCode || null,
      fullError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create eBay listing',
        message: error.message,
        ebayErrorResponse: error.ebayErrorResponse || null,
        ebayStatusCode: error.ebayStatusCode || null,
        fullErrorMessage: error.toString(),
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
