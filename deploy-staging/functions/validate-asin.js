/**
 * Story 10: Validate ASIN and Get Category Info
 * 
 * When user enters ASIN:
 * 1. Fetch title from Keepa
 * 2. Get category suggestion from eBay
 * 3. Return valid conditions for that category
 * 
 * POST /validate-asin
 * Body: { asin }
 * Returns: { title, imageUrl, categoryId, categoryName, validConditions }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { getCategorySuggestion } = require('./get-ebay-category-suggestion');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Common category conditions - covers most use cases
// TODO: Move to database table for full coverage
const CATEGORY_CONDITIONS = {
  // LEGO categories
  '19006': ['NEW', 'NEW_OTHER', 'USED'],           // LEGO Complete Sets
  '183446': ['NEW', 'NEW_OTHER', 'USED'],          // LEGO Minifigures
  '183448': ['NEW', 'NEW_OTHER', 'USED'],          // LEGO Pieces & Parts
  
  // Video Games
  '139973': ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'],  // Video Games
  '54968': ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'],   // Video Game Consoles
  
  // Electronics
  '15032': ['NEW', 'NEW_OTHER', 'CERTIFIED_REFURBISHED', 'SELLER_REFURBISHED', 'USED'],  // Cell Phones
  '112529': ['NEW', 'NEW_OTHER', 'CERTIFIED_REFURBISHED', 'SELLER_REFURBISHED', 'USED'], // Headphones
  '58058': ['NEW', 'NEW_OTHER', 'SELLER_REFURBISHED', 'USED'],       // Speakers
  
  // Books
  '261186': ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'],  // Books
  '279': ['NEW', 'LIKE_NEW', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE'],     // Textbooks
  
  // Toys
  '220': ['NEW', 'NEW_OTHER', 'USED'],             // Toys & Hobbies
  '2624': ['NEW', 'NEW_OTHER', 'USED'],            // Action Figures
  
  // Home & Kitchen
  '20625': ['NEW', 'NEW_OTHER', 'USED'],           // Small Kitchen Appliances
  '38251': ['NEW', 'NEW_OTHER', 'USED'],           // Air Fryers
  
  // Default for unknown categories
  'default': ['NEW', 'LIKE_NEW', 'NEW_OTHER', 'VERY_GOOD', 'GOOD', 'ACCEPTABLE', 'USED']
};

// Condition display names
const CONDITION_LABELS = {
  'NEW': 'Brand New',
  'NEW_OTHER': 'New (Open Box)',
  'LIKE_NEW': 'Like New',
  'CERTIFIED_REFURBISHED': 'Certified Refurbished',
  'SELLER_REFURBISHED': 'Seller Refurbished',
  'VERY_GOOD': 'Very Good',
  'GOOD': 'Good',
  'ACCEPTABLE': 'Acceptable',
  'USED': 'Used',
  'FOR_PARTS': 'For Parts or Not Working'
};

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Auth check
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    // Parse request
    const { asin } = JSON.parse(event.body);
    
    if (!asin || !/^B[0-9A-Z]{9}$/.test(asin)) {
      return { 
        statusCode: 400, 
        headers, 
        body: JSON.stringify({ error: 'Valid ASIN required' }) 
      };
    }

    console.log(`🔍 Validating ASIN: ${asin}`);

    // Step 1: Get product info from Keepa
    const keepaResponse = await fetch(
      `https://api.keepa.com/product?key=${process.env.KEEPA_API_KEY}&domain=1&asin=${asin}`
    );
    
    if (!keepaResponse.ok) {
      throw new Error('Failed to fetch product from Keepa');
    }

    const keepaData = await keepaResponse.json();
    const product = keepaData.products?.[0];
    
    if (!product) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Product not found', asin })
      };
    }

    const title = product.title || 'Unknown Product';
    const imageUrl = product.imagesCSV 
      ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(',')[0]}`
      : null;

    console.log(`📦 Found: "${title.substring(0, 50)}..."`);

    // Step 2: Get category suggestion from eBay
    const categoryResult = await getCategorySuggestion(title);
    
    const categoryId = categoryResult.categoryId || null;
    const categoryName = categoryResult.categoryName || 'Unknown';

    console.log(`🏷️ Category: ${categoryId} - ${categoryName}`);

    // Step 3: Look up valid conditions for this category
    let validConditions = CATEGORY_CONDITIONS[categoryId] || CATEGORY_CONDITIONS['default'];
    
    // Also check parent categories (first 3-4 digits often group similar categories)
    if (!CATEGORY_CONDITIONS[categoryId] && categoryId) {
      const parentId = categoryId.substring(0, 3);
      for (const [key, conditions] of Object.entries(CATEGORY_CONDITIONS)) {
        if (key.startsWith(parentId)) {
          validConditions = conditions;
          break;
        }
      }
    }

    // Format conditions with labels
    const conditions = validConditions.map(c => ({
      value: c,
      label: CONDITION_LABELS[c] || c
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin,
        title,
        imageUrl,
        categoryId,
        categoryName,
        validConditions: conditions,
        defaultCondition: validConditions[0] // Usually NEW
      })
    };

  } catch (error) {
    console.error('Validation error:', error);
    
    // Return fallback with all conditions on error
    return {
      statusCode: 200, // Still 200 so UI doesn't break
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        validConditions: Object.entries(CONDITION_LABELS).map(([value, label]) => ({ value, label })),
        defaultCondition: 'NEW'
      })
    };
  }
};
