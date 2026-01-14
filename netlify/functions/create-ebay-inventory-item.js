/**
 * Create eBay Inventory Item
 * 
 * Story 1: Create eBay Inventory Item from ASIN
 * Story 4C: Integrate Category & Aspects
 * Story 5B: AI-Generated Title & Description
 * 
 * Flow:
 * 1. Authenticate user
 * 2. Fetch product data from Keepa
 * 3. Get eBay category suggestion for product title
 * 4. Get required aspects for the category
 * 5. Generate AI-optimized title & description
 * 6. Transform to eBay inventory item format (with category aspects)
 * 7. Create inventory item via eBay API
 * 8. Return SKU and details (including categoryId for offer creation)
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getValidAccessToken, ebayApiRequest } = require('./utils/ebay-oauth');
const { decrypt } = require('./utils/encryption');
const { getCategorySuggestion } = require('./get-ebay-category-suggestion');
const { getCategoryAspects } = require('./get-ebay-category-aspects');
const { generateListingContent } = require('./generate-ebay-listing-content');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// SKU prefix per Pete's requirements
const SKU_PREFIX = 'wi_';

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
    console.log('📦 create-ebay-inventory-item called');

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
    const { asin, condition = 'NEW', quantity = 1 } = JSON.parse(event.body);

    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }

    // Validate ASIN format
    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid ASIN format' })
      };
    }

    // Generate SKU
    const sku = `${SKU_PREFIX}${asin}`;
    console.log(`📝 Generated SKU: ${sku}`);

    // 3. Fetch product data from Keepa
    console.log('🔍 Fetching product data from Keepa...');
    const keepaData = await fetchKeepaProduct(user.id, asin);
    
    if (!keepaData.success) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: keepaData.error || 'Failed to fetch product data' })
      };
    }

    const { ebayDraft, keepaData: rawKeepa } = keepaData;
    console.log(`✅ Got Keepa data: ${ebayDraft.title}`);

    // 4. Get eBay category suggestion
    console.log('🏷️ Getting eBay category suggestion...');
    const categoryResult = await getCategorySuggestion(ebayDraft.title);
    
    if (!categoryResult.categoryId) {
      console.error('❌ Failed to get category suggestion:', categoryResult.error);
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Failed to determine eBay category',
          message: categoryResult.error || 'No category suggestion returned for this product',
          title: ebayDraft.title
        })
      };
    }
    
    console.log(`✅ Got category: ${categoryResult.categoryId} - ${categoryResult.categoryName}`);

    // 5. Get required aspects for the category (non-blocking)
    console.log('📋 Getting required aspects for category...');
    let categoryAspects = [];
    try {
      const aspectsResult = await getCategoryAspects(categoryResult.categoryId);
      if (aspectsResult.aspects && aspectsResult.aspects.length > 0) {
        categoryAspects = aspectsResult.aspects;
        console.log(`✅ Got ${categoryAspects.length} required aspects`);
      } else {
        console.log('ℹ️ No required aspects for this category');
      }
    } catch (aspectError) {
      console.warn('⚠️ Failed to fetch category aspects (non-blocking):', aspectError.message);
      // Continue with empty aspects - this is non-blocking per requirements
    }

    // 6. Generate AI-optimized title & description
    console.log('🤖 Generating AI-optimized listing content...');
    const originalTitle = ebayDraft.title;
    let aiContentResult = null;
    
    try {
      aiContentResult = await generateListingContent({
        title: ebayDraft.title,
        description: ebayDraft.description,
        features: rawKeepa.features || [],
        brand: ebayDraft.brand,
        model: ebayDraft.model,
        color: rawKeepa.color || '',
        category: categoryResult.categoryName
      });
      
      // Use AI-generated content
      ebayDraft.title = aiContentResult.title;
      ebayDraft.description = aiContentResult.description;
      console.log(`✅ AI optimized title: "${aiContentResult.title}" (${aiContentResult.generatedTitleLength} chars)`);
    } catch (aiError) {
      console.warn('⚠️ AI generation failed, using Keepa data:', aiError.message);
      // Continue with original Keepa data - this is non-blocking
      aiContentResult = { 
        title: ebayDraft.title, 
        description: ebayDraft.description,
        aiModel: 'fallback-keepa'
      };
    }

    // 7. Get valid eBay access token
    console.log('🔑 Getting eBay access token...');
    const accessToken = await getValidAccessToken(supabase, user.id);

    // 8. Get learned patterns from database
    console.log('🧠 Fetching learned aspect patterns...');
    const learnedPatterns = await getLearnedPatterns(supabase, categoryResult.categoryId);
    console.log(`   Found ${learnedPatterns.length} learned patterns`);

    // 9. PROACTIVELY fill ALL missing required aspects (Keepa → Patterns → AI)
    console.log('🔍 Proactively filling all required aspects...');
    const filledAspects = await fillAllRequiredAspects({
      categoryAspects,
      categoryResult,
      ebayDraft,
      keepaProduct: rawKeepa,
      learnedPatterns,
      asin,
      supabase
    });
    
    // Merge filled aspects into ebayDraft
    ebayDraft.aspects = { ...ebayDraft.aspects, ...filledAspects };
    console.log(`✅ Filled ${Object.keys(filledAspects).length} aspects proactively`);

    // 10. Build eBay Inventory Item payload
    const inventoryItem = buildInventoryItemSimple(ebayDraft, rawKeepa, condition, quantity);
    console.log('📋 Built inventory item payload');

    // 9. Create inventory item via eBay API
    console.log(`📤 Creating inventory item with SKU: ${sku}`);
    
    const result = await ebayApiRequest(
      accessToken,
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: 'PUT',
        body: JSON.stringify(inventoryItem)
      }
    );

    console.log('✅ eBay inventory item created successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        sku: sku,
        asin: asin,
        title: ebayDraft.title,
        originalTitle: originalTitle,
        titleOptimized: originalTitle !== ebayDraft.title,
        aiModel: aiContentResult?.aiModel || 'none',
        condition: condition,
        quantity: quantity,
        categoryId: categoryResult.categoryId,
        categoryName: categoryResult.categoryName,
        aspectsIncluded: Object.keys(inventoryItem.product.aspects || {}),
        message: 'Inventory item created successfully'
      })
    };

  } catch (error) {
    console.error('❌ Error creating inventory item:', error);
    
    // Parse eBay API errors for better messages
    let errorMessage = error.message;
    if (error.message.includes('eBay API error')) {
      errorMessage = error.message;
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to create inventory item',
        message: errorMessage,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

/**
 * Call Supabase edge function to determine aspect value
 * The edge function has the AI keys and eBay API access
 */
async function getAspectValueFromAI(aspectName, productTitle, categoryName, categoryId, brand, supabaseClient) {
  try {
    // Insert a pending record and let the trigger process it
    const { data: insertData, error: insertError } = await supabaseClient
      .from('ebay_aspect_misses')
      .insert({
        asin: `TEMP_${Date.now()}`,
        aspect_name: aspectName,
        product_title: productTitle,
        category_id: categoryId,
        category_name: categoryName,
        keepa_brand: brand,
        status: 'pending'
      })
      .select()
      .single();
    
    if (insertError) {
      console.warn(`⚠️ Failed to insert aspect miss: ${insertError.message}`);
      return null;
    }
    
    // Call the edge function directly to process it now
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/aspect-keyword-review`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    
    // Wait a moment for processing
    await new Promise(r => setTimeout(r, 2000));
    
    // Fetch the result
    const { data: result, error: fetchError } = await supabaseClient
      .from('ebay_aspect_misses')
      .select('suggested_value, suggested_pattern, status')
      .eq('id', insertData.id)
      .single();
    
    if (fetchError || !result || result.status !== 'processed') {
      console.warn(`⚠️ Aspect not processed: ${fetchError?.message || result?.status}`);
      // Clean up
      await supabaseClient.from('ebay_aspect_misses').delete().eq('id', insertData.id);
      return null;
    }
    
    // Clean up the temp record
    await supabaseClient.from('ebay_aspect_misses').delete().eq('id', insertData.id);
    
    return { value: result.suggested_value, pattern: result.suggested_pattern };
  } catch (e) {
    console.warn(`⚠️ AI aspect lookup failed: ${e.message}`);
    return null;
  }
}

/**
 * PROACTIVELY fill ALL missing required aspects
 * Order: Keepa → Learned Patterns → AI (with valid values from eBay)
 */
async function fillAllRequiredAspects({ categoryAspects, categoryResult, ebayDraft, keepaProduct, learnedPatterns, asin, supabase }) {
  const filledAspects = {};
  
  for (const aspect of categoryAspects) {
    if (!aspect.required) continue;
    
    const aspectName = aspect.name;
    
    // Skip if already have from Keepa
    if (ebayDraft.aspects[aspectName]) {
      console.log(`  ✓ ${aspectName}: from Keepa`);
      continue;
    }
    
    // Try Keepa mapping
    const mappedValue = mapAspectFromKeepa(aspectName, keepaProduct, ebayDraft);
    if (mappedValue) {
      filledAspects[aspectName] = Array.isArray(mappedValue) ? mappedValue : [mappedValue];
      console.log(`  ✓ ${aspectName}: mapped from Keepa`);
      continue;
    }
    
    // Try learned patterns
    const learnedValue = matchLearnedPattern(aspectName, ebayDraft.title, learnedPatterns, categoryResult.categoryId);
    if (learnedValue) {
      filledAspects[aspectName] = [learnedValue];
      console.log(`  🧠 ${aspectName}: from learned pattern → ${learnedValue}`);
      continue;
    }
    
    // No pattern found - call AI NOW to get value
    console.log(`  🤖 ${aspectName}: calling AI via edge function...`);
    
    // Call AI via Supabase edge function (it handles eBay valid values internally)
    const aiResult = await getAspectValueFromAI(
      aspectName,
      ebayDraft.title,
      categoryResult.categoryName,
      categoryResult.categoryId,
      keepaProduct.brand,
      supabase
    );
    
    if (aiResult && aiResult.value) {
      filledAspects[aspectName] = [aiResult.value];
      console.log(`  ✓ ${aspectName}: AI determined → ${aiResult.value}`);
      
      // Save pattern for future use (non-blocking)
      if (aiResult.pattern && supabase) {
        supabase
          .from('ebay_aspect_keywords')
          .insert({
            aspect_name: aspectName,
            aspect_value: aiResult.value,
            keyword_pattern: aiResult.pattern,
            category_id: categoryResult.categoryId
          })
          .then(() => console.log(`  📝 Saved pattern for ${aspectName}`))
          .catch(() => {});
      }
    } else {
      console.log(`  ⚠️ ${aspectName}: could not determine value`);
    }
  }
  
  return filledAspects;
}

/**
 * Get learned aspect patterns from database
 * These are patterns learned from previous aspect misses via AI
 */
async function getLearnedPatterns(supabaseClient, categoryId) {
  try {
    // Get patterns for this category OR universal patterns (null category)
    const { data: patterns, error } = await supabaseClient
      .from('ebay_aspect_keywords')
      .select('aspect_name, aspect_value, keyword_pattern, category_id')
      .or(`category_id.eq.${categoryId},category_id.is.null`);
    
    if (error) {
      console.warn('⚠️ Failed to fetch learned patterns:', error.message);
      return [];
    }
    
    return patterns || [];
  } catch (e) {
    console.warn('⚠️ Error fetching learned patterns:', e.message);
    return [];
  }
}

/**
 * Try to match a product title against learned patterns
 * Returns the aspect value if a pattern matches, null otherwise
 */
function matchLearnedPattern(aspectName, productTitle, learnedPatterns, categoryId) {
  // Filter patterns for this aspect
  const relevantPatterns = learnedPatterns.filter(p => p.aspect_name === aspectName);
  
  // Sort: category-specific patterns first, then universal
  relevantPatterns.sort((a, b) => {
    if (a.category_id === categoryId && b.category_id !== categoryId) return -1;
    if (b.category_id === categoryId && a.category_id !== categoryId) return 1;
    return 0;
  });
  
  // Try each pattern
  for (const pattern of relevantPatterns) {
    try {
      const regex = new RegExp(pattern.keyword_pattern, 'i');
      if (regex.test(productTitle)) {
        console.log(`  🧠 ${aspectName}: matched learned pattern "${pattern.keyword_pattern}" → ${pattern.aspect_value}`);
        return pattern.aspect_value;
      }
    } catch (e) {
      // Invalid regex, skip
      console.warn(`  ⚠️ Invalid pattern for ${aspectName}: ${pattern.keyword_pattern}`);
    }
  }
  
  return null;
}

/**
 * Fetch product data from Keepa API
 */
async function fetchKeepaProduct(userId, asin) {
  // Get user's Keepa API key
  const { data: keyData, error: keyError } = await supabase
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', 'keepa')
    .single();

  if (keyError || !keyData) {
    return { success: false, error: 'Keepa API key not found. Please add it in API Keys.' };
  }

  const keepaApiKey = decrypt(keyData.api_key_encrypted);
  if (!keepaApiKey) {
    return { success: false, error: 'Failed to decrypt Keepa API key' };
  }

  // Fetch from Keepa
  const keepaUrl = `https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}&stats=180&offers=20`;
  
  const response = await fetch(keepaUrl);
  const data = await response.json();

  if (!response.ok || !data.products || data.products.length === 0) {
    return { success: false, error: `Product not found for ASIN: ${asin}` };
  }

  const product = data.products[0];
  
  // Transform to eBay format (reusing logic from keepa-fetch-product.js)
  const ebayDraft = transformKeepaToEbay(product);

  return {
    success: true,
    keepaData: product,
    ebayDraft: ebayDraft
  };
}

/**
 * Transform Keepa data to eBay draft format
 */
function transformKeepaToEbay(keepaProduct) {
  // Extract images
  const images = [];
  
  if (keepaProduct.images && Array.isArray(keepaProduct.images)) {
    keepaProduct.images.forEach(imgObj => {
      if (imgObj) {
        const imageVariant = imgObj.l || imgObj.m;
        if (imageVariant) {
          images.push(`https://m.media-amazon.com/images/I/${imageVariant}`);
        }
      }
    });
  } else if (keepaProduct.imagesCSV) {
    const imageFilenames = keepaProduct.imagesCSV.split(',');
    imageFilenames.forEach(filename => {
      const trimmed = filename.trim();
      if (trimmed) {
        images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
      }
    });
  }

  // Build aspects
  const aspects = {};
  if (keepaProduct.brand) aspects.Brand = [keepaProduct.brand];
  if (keepaProduct.model) aspects.Model = [keepaProduct.model];
  if (keepaProduct.color) aspects.Color = [keepaProduct.color];
  if (keepaProduct.manufacturer) aspects.Manufacturer = [keepaProduct.manufacturer];
  if (keepaProduct.partNumber) aspects.MPN = [keepaProduct.partNumber];
  
  // UPC
  if (keepaProduct.upcList && keepaProduct.upcList.length > 0) {
    aspects.UPC = [keepaProduct.upcList[0]];
  }

  return {
    title: keepaProduct.title ? keepaProduct.title.substring(0, 80) : '',
    description: keepaProduct.description || buildDescriptionFromFeatures(keepaProduct),
    brand: keepaProduct.brand || '',
    model: keepaProduct.model || '',
    images: images.slice(0, 12), // eBay max 12 images
    aspects: aspects
  };
}

/**
 * Build description from features if no main description
 */
function buildDescriptionFromFeatures(product) {
  if (product.features && product.features.length > 0) {
    let html = '<h3>Product Features</h3><ul>';
    product.features.forEach(feature => {
      html += `<li>${escapeHtml(feature)}</li>`;
    });
    html += '</ul>';
    return html;
  }
  return 'Product information available upon request.';
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Build eBay Inventory Item payload (simplified - aspects already filled)
 */
function buildInventoryItemSimple(ebayDraft, keepaProduct, condition, quantity) {
  const item = {
    availability: {
      shipToLocationAvailability: {
        quantity: quantity
      }
    },
    condition: mapCondition(condition),
    product: {
      title: ebayDraft.title,
      description: ebayDraft.description,
      aspects: ebayDraft.aspects,
      imageUrls: ebayDraft.images
    }
  };

  // Add brand if available
  if (ebayDraft.brand) {
    item.product.brand = ebayDraft.brand;
  }

  // Add MPN (Manufacturer Part Number) - required for many categories
  if (keepaProduct.partNumber) {
    item.product.mpn = keepaProduct.partNumber;
  }

  // Add UPC/EAN/ISBN if available (product identifiers)
  if (keepaProduct.upcList && keepaProduct.upcList.length > 0) {
    item.product.upc = [keepaProduct.upcList[0]];
  }
  if (keepaProduct.eanList && keepaProduct.eanList.length > 0) {
    item.product.ean = [keepaProduct.eanList[0]];
  }

  return item;
}

/**
 * Map eBay aspect names to available Keepa data
 * Handles common alternative names for aspects
 */
function mapAspectFromKeepa(aspectName, keepaProduct, ebayDraft) {
  const lowerAspect = aspectName.toLowerCase();
  
  // Common mappings
  if (lowerAspect === 'brand' && keepaProduct.brand) {
    return keepaProduct.brand;
  }
  if (lowerAspect === 'model' && keepaProduct.model) {
    return keepaProduct.model;
  }
  if ((lowerAspect === 'mpn' || lowerAspect === 'manufacturer part number') && keepaProduct.partNumber) {
    return keepaProduct.partNumber;
  }
  if (lowerAspect === 'manufacturer' && keepaProduct.manufacturer) {
    return keepaProduct.manufacturer;
  }
  if (lowerAspect === 'color' && keepaProduct.color) {
    return keepaProduct.color;
  }
  if (lowerAspect === 'upc' && keepaProduct.upcList && keepaProduct.upcList.length > 0) {
    return keepaProduct.upcList[0];
  }
  if (lowerAspect === 'ean' && keepaProduct.eanList && keepaProduct.eanList.length > 0) {
    return keepaProduct.eanList[0];
  }
  if ((lowerAspect === 'size' || lowerAspect === 'item size') && keepaProduct.size) {
    return keepaProduct.size;
  }
  if ((lowerAspect === 'material' || lowerAspect === 'material type') && keepaProduct.material) {
    return keepaProduct.material;
  }
  
  return null;
}

/**
 * Map condition string to eBay condition enum
 */
function mapCondition(condition) {
  const conditionMap = {
    'NEW': 'NEW',
    'LIKE_NEW': 'LIKE_NEW',
    'NEW_OTHER': 'NEW_OTHER',
    'NEW_WITH_DEFECTS': 'NEW_WITH_DEFECTS',
    'MANUFACTURER_REFURBISHED': 'MANUFACTURER_REFURBISHED',
    'CERTIFIED_REFURBISHED': 'CERTIFIED_REFURBISHED',
    'EXCELLENT_REFURBISHED': 'EXCELLENT_REFURBISHED',
    'VERY_GOOD_REFURBISHED': 'VERY_GOOD_REFURBISHED',
    'GOOD_REFURBISHED': 'GOOD_REFURBISHED',
    'SELLER_REFURBISHED': 'SELLER_REFURBISHED',
    'USED_EXCELLENT': 'USED_EXCELLENT',
    'USED_VERY_GOOD': 'USED_VERY_GOOD',
    'USED_GOOD': 'USED_GOOD',
    'USED_ACCEPTABLE': 'USED_ACCEPTABLE',
    'FOR_PARTS_OR_NOT_WORKING': 'FOR_PARTS_OR_NOT_WORKING'
  };
  
  return conditionMap[condition.toUpperCase()] || 'NEW';
}
