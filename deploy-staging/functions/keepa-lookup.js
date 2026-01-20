/**
 * Keepa Lookup - Fetch product data from Keepa API
 * 
 * GET /.netlify/functions/keepa-lookup?asin=B0XXXXXXXXX
 * Returns: { asin, title, imageUrl, brand, category }
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Get ASIN from query params
    const asin = event.queryStringParameters?.asin;
    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN required' })
      };
    }

    // Get Keepa API key
    const keepaKey = process.env.KEEPA_API_KEY;
    if (!keepaKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Keepa API key not configured' })
      };
    }

    // Fetch from Keepa API
    const keepaUrl = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}&stats=1`;
    const response = await fetch(keepaUrl);
    
    if (!response.ok) {
      throw new Error(`Keepa API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.products || data.products.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Product not found' })
      };
    }

    const product = data.products[0];
    
    // Extract image URL from Keepa format
    let imageUrl = null;
    if (product.imagesCSV) {
      const images = product.imagesCSV.split(',');
      if (images.length > 0) {
        // Keepa stores image codes, convert to full URL
        imageUrl = `https://images-na.ssl-images-amazon.com/images/I/${images[0]}`;
      }
    }
    
    // Fallback to Keepa's cached image
    if (!imageUrl) {
      imageUrl = `https://images.keepa.com/600/${asin}.jpg`;
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        asin: asin,
        title: product.title || null,
        imageUrl: imageUrl,
        brand: product.brand || null,
        category: product.categoryTree?.[0]?.name || null,
        tokensLeft: data.tokensLeft
      })
    };

  } catch (error) {
    console.error('Keepa lookup error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
