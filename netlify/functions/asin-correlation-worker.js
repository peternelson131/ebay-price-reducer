/**
 * ASIN Correlation Worker
 * 
 * Replaces the n8n workflow with native serverless logic.
 * 
 * Flow:
 * 1. Fetch primary ASIN data from Keepa
 * 2. Get variation ASINs
 * 3. Search for similar products
 * 4. AI-evaluate candidates (Claude)
 * 5. Write results to Supabase
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

// Lazy-init clients
let supabase = null;
let anthropic = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

function getAnthropic() {
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropic;
}

// ==================== KEEPA API ====================

async function keepaProductLookup(asins, keepaKey) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins;
  const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}&offers=0&history=0`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Keepa API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.products || [];
}

async function keepaProductSearch(title, keepaKey) {
  // Search for similar products by title keywords
  const keywords = title
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 5)
    .join(' ');
  
  const url = `https://api.keepa.com/query?key=${keepaKey}&domain=1&type=product&term=${encodeURIComponent(keywords)}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Keepa search error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.asinList || [];
}

// ==================== HELPERS ====================

function getImageUrl(product) {
  if (!product?.images?.[0]) return '';
  const img = product.images[0].l || product.images[0].m || '';
  return img ? `https://m.media-amazon.com/images/I/${img}` : '';
}

function getAmazonUrl(asin) {
  return `https://www.amazon.com/dp/${asin}`;
}

// ==================== AI EVALUATION ====================

async function evaluateSimilarity(primary, candidate) {
  const prompt = `PRIMARY PRODUCT:
Title: ${primary.title}
Brand: ${primary.brand || 'Unknown'}

CANDIDATE PRODUCT:
ASIN: ${candidate.asin}
Title: ${candidate.title}
Brand: ${candidate.brand || 'Unknown'}

Question: Is the CANDIDATE the same product as the primary product?

Answer YES if:
- Both are the same product (e.g., both speakers, both headphones)
- Candidate is a variant of the primary (different color, size, model)

Answer NO if:
- Candidate is a different kind of product (e.g., primary is speaker, candidate is cable)
- Candidate is an accessory (charger, cable, case, adapter)
- Candidate serves a completely different purpose
- The candidate is a different year's model of a product

Answer with ONLY: YES or NO`;

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    });
    
    const answer = response.content[0].text.toUpperCase().trim();
    return answer.includes('YES');
  } catch (error) {
    console.error(`AI evaluation failed for ${candidate.asin}:`, error.message);
    return false; // Default to not including on error
  }
}

// ==================== MAIN WORKFLOW ====================

async function processAsinCorrelation(asin, userId, keepaKey) {
  console.log(`🔄 Processing ASIN: ${asin}`);
  
  // Step 1: Get primary product data
  console.log('📦 Fetching primary product...');
  const primaryProducts = await keepaProductLookup(asin, keepaKey);
  
  if (!primaryProducts.length) {
    return { error: 'Product not found in Keepa', correlations: [] };
  }
  
  const primary = primaryProducts[0];
  const primaryData = {
    asin: primary.asin,
    title: primary.title || 'Unknown',
    brand: primary.brand || 'Unknown',
    image: getImageUrl(primary),
    url: getAmazonUrl(primary.asin)
  };
  
  console.log(`✅ Primary: ${primaryData.title.substring(0, 50)}...`);
  
  // Step 2: Get variations
  const variationAsins = (primary.variations || [])
    .map(v => v.asin)
    .filter(a => a !== asin);
  
  console.log(`📋 Found ${variationAsins.length} variations`);
  
  let variations = [];
  if (variationAsins.length > 0) {
    const variationProducts = await keepaProductLookup(variationAsins.slice(0, 20), keepaKey);
    variations = variationProducts.map(p => ({
      asin: p.asin,
      title: p.title || 'Unknown',
      brand: p.brand || 'Unknown',
      image: getImageUrl(p),
      url: getAmazonUrl(p.asin),
      type: 'variation'
    }));
  }
  
  // Step 3: Search for similar products
  console.log('🔍 Searching for similar products...');
  const similarAsins = await keepaProductSearch(primaryData.title, keepaKey);
  
  // Filter out primary and variations
  const excludeSet = new Set([asin, ...variationAsins]);
  const candidateAsins = similarAsins
    .filter(a => !excludeSet.has(a))
    .slice(0, 30); // Limit to 30 candidates
  
  console.log(`📋 Found ${candidateAsins.length} candidates to evaluate`);
  
  // Step 4: Get candidate details and AI evaluate
  let similarProducts = [];
  
  if (candidateAsins.length > 0) {
    // Batch fetch candidate details (max 100 per Keepa call)
    const candidateProducts = await keepaProductLookup(candidateAsins, keepaKey);
    
    // AI evaluate each candidate
    console.log('🤖 AI evaluating candidates...');
    
    for (const candidate of candidateProducts) {
      const candidateData = {
        asin: candidate.asin,
        title: candidate.title || 'Unknown',
        brand: candidate.brand || 'Unknown',
        image: getImageUrl(candidate),
        url: getAmazonUrl(candidate.asin)
      };
      
      const isApproved = await evaluateSimilarity(primaryData, candidateData);
      
      if (isApproved) {
        similarProducts.push({
          ...candidateData,
          type: 'similar'
        });
        console.log(`  ✅ ${candidateData.asin}: ${candidateData.title.substring(0, 40)}...`);
      } else {
        console.log(`  ❌ ${candidateData.asin}: rejected`);
      }
    }
  }
  
  // Step 5: Build results
  const allCorrelations = [...variations, ...similarProducts];
  
  console.log(`📊 Total correlations: ${allCorrelations.length} (${variations.length} variations, ${similarProducts.length} similar)`);
  
  // Step 6: Write to database
  if (allCorrelations.length > 0) {
    console.log('💾 Writing to database...');
    
    const records = allCorrelations.map(item => ({
      user_id: userId,
      search_asin: asin,
      similar_asin: item.asin,
      correlated_title: item.title,
      image_url: item.image,
      search_image_url: primaryData.image,
      suggested_type: item.type,
      source: 'serverless',
      correlated_amazon_url: item.url
    }));
    
    const { error: dbError } = await getSupabase()
      .from('asin_correlations')
      .upsert(records, { 
        onConflict: 'search_asin,similar_asin',
        ignoreDuplicates: false 
      });
    
    if (dbError) {
      console.error('❌ Database write error:', dbError);
    } else {
      console.log(`✅ Wrote ${records.length} records to database`);
    }
  }
  
  return {
    primaryAsin: asin,
    primaryTitle: primaryData.title,
    primaryImage: primaryData.image,
    correlations: allCorrelations,
    variationCount: variations.length,
    similarCount: similarProducts.length
  };
}

// ==================== HANDLER ====================

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  // Handle CORS preflight
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
    // Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }
    
    // Parse request
    const { asin, keepaKey } = JSON.parse(event.body);
    
    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }
    
    // Validate ASIN format
    if (!/^B[0-9A-Z]{9}$/i.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid ASIN format' })
      };
    }
    
    // Get Keepa API key (user-provided or fallback to env)
    const apiKey = keepaKey || process.env.KEEPA_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Keepa API key required' })
      };
    }
    
    // Process the ASIN
    const result = await processAsinCorrelation(asin.toUpperCase(), user.id, apiKey);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        ...result
      })
    };
    
  } catch (error) {
    console.error('❌ Worker error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Processing failed',
        message: error.message
      })
    };
  }
};
