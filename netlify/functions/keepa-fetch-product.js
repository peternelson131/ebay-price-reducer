const fetch = require('node-fetch');
const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

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

    // 2. Parse and validate ASIN
    const { asin } = JSON.parse(event.body);

    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }

    // Validate ASIN format (B followed by 9 alphanumeric characters)
    if (!/^B[0-9A-Z]{9}$/.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid ASIN format. Must be B followed by 9 characters.' })
      };
    }

    // 3. Get Keepa API key from user's database record
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('keepa_api_key')
      .eq('id', user.id)
      .single();

    if (userError) {
      throw new Error('Failed to retrieve user data');
    }

    const keepaApiKey = userData?.keepa_api_key;
    if (!keepaApiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Keepa API key not configured. Please add your Keepa API key in settings.'
        })
      };
    }

    const keepaUrl = `https://api.keepa.com/product?key=${keepaApiKey}&domain=1&asin=${asin}&stats=30`;

    console.log(`Fetching Keepa data for ASIN: ${asin}`);
    const keepaResponse = await fetch(keepaUrl);

    if (!keepaResponse.ok) {
      throw new Error(`Keepa API error: ${keepaResponse.status}`);
    }

    const keepaData = await keepaResponse.json();

    // 4. Validate Keepa response
    if (!keepaData.products || keepaData.products.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Product not found on Amazon/Keepa' })
      };
    }

    const product = keepaData.products[0];

    // 5. Transform to eBay-compatible format
    const ebayDraft = transformKeepaToEbay(product);

    // 6. Return both raw Keepa data and transformed draft
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin: asin,
        keepaData: product,
        ebayDraft: ebayDraft
      })
    };

  } catch (error) {
    console.error('Keepa fetch error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch product data',
        message: error.message
      })
    };
  }
};

/**
 * Transform Keepa product data to eBay-compatible format
 */
function transformKeepaToEbay(keepaProduct) {
  // Extract images from CSV and construct URLs
  const images = [];
  if (keepaProduct.imagesCSV) {
    const imageFilenames = keepaProduct.imagesCSV.split(',');
    imageFilenames.forEach(filename => {
      const trimmed = filename.trim();
      if (trimmed) {
        images.push(`https://m.media-amazon.com/images/I/${trimmed}`);
      }
    });
  }

  // Build description from Keepa data
  const description = buildDescription(keepaProduct);

  // Extract item specifics/aspects
  const aspects = buildAspects(keepaProduct);

  return {
    title: keepaProduct.title ? keepaProduct.title.substring(0, 80) : '', // eBay 80 char limit
    description: description,
    brand: keepaProduct.brand || '',
    model: keepaProduct.model || '',
    images: images.slice(0, 12), // eBay max 12 images
    aspects: aspects,
    // These will be set by user:
    // - price
    // - quantity
    // - condition
    // - sku (auto-generated)
  };
}

/**
 * Build HTML description from Keepa product data
 */
function buildDescription(product) {
  let html = '';

  // Main description
  if (product.description) {
    html += product.description;
  }

  // Features as bullet points
  if (product.features && product.features.length > 0) {
    html += '<h3>Features</h3><ul>';
    product.features.forEach(feature => {
      html += `<li>${escapeHtml(feature)}</li>`;
    });
    html += '</ul>';
  }

  // Specifications
  const hasSpecs = product.itemWeight || product.itemHeight ||
                   product.itemLength || product.itemWidth;

  if (hasSpecs) {
    html += '<h3>Specifications</h3><ul>';
    if (product.itemWeight) html += `<li>Weight: ${escapeHtml(product.itemWeight)}</li>`;
    if (product.itemHeight) html += `<li>Height: ${escapeHtml(product.itemHeight)}</li>`;
    if (product.itemLength) html += `<li>Length: ${escapeHtml(product.itemLength)}</li>`;
    if (product.itemWidth) html += `<li>Width: ${escapeHtml(product.itemWidth)}</li>`;
    html += '</ul>';
  }

  return html || 'No description available';
}

/**
 * Build item aspects object from Keepa data
 */
function buildAspects(product) {
  const aspects = {};

  if (product.brand) aspects.Brand = [product.brand];
  if (product.model) aspects.Model = [product.model];
  if (product.color) aspects.Color = [product.color];
  if (product.size) aspects.Size = [product.size];
  if (product.manufacturer) aspects.Manufacturer = [product.manufacturer];

  // eBay often requires MPN (Manufacturer Part Number)
  if (product.model) aspects.MPN = [product.model];

  return aspects;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
