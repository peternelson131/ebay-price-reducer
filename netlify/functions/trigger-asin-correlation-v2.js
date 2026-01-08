/**
 * ASIN Correlation Trigger v2
 * 
 * Supports two modes:
 * 1. Native serverless processing (default)
 * 2. n8n webhook fallback (if FORCE_N8N=true)
 * 
 * For SaaS: Users provide their own Keepa API key
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

// Get user's API key from database
async function getUserApiKey(userId, service) {
  const { data, error } = await getSupabase()
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', service)
    .single();
  
  if (error || !data) {
    return null;
  }
  
  // In production, decrypt the key here
  return data.api_key_encrypted;
}

// Track API usage
async function trackUsage(userId, service, action, tokensUsed = 0, costCents = 0) {
  try {
    await getSupabase()
      .from('api_usage')
      .insert({
        user_id: userId,
        service,
        action,
        tokens_used: tokensUsed,
        cost_cents: costCents
      });
  } catch (e) {
    console.error('Failed to track usage:', e);
  }
}

// Direct Anthropic API call (no SDK needed)
async function callClaude(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}

// ==================== KEEPA API ====================

async function keepaProductLookup(asins, keepaKey) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins;
  const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}`;
  
  console.log(`📦 Keepa lookup: ${asinString.substring(0, 30)}...`);
  
  try {
    const response = await axios.get(url, {
      decompress: true,  // auto-decompress gzip
      timeout: 30000
    });
    
    const data = response.data;
    
    // Check for Keepa-specific errors
    if (data.error) {
      throw new Error(`Keepa error: ${data.error.message || JSON.stringify(data.error)}`);
    }
    
    console.log(`✅ Keepa returned ${data.products?.length || 0} products`);
    return data.products || [];
  } catch (error) {
    if (error.response) {
      throw new Error(`Keepa API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    }
    throw error;
  }
}

async function keepaProductSearch(brand, rootCategory, keepaKey) {
  // Keepa Product Finder query format
  const selection = JSON.stringify({
    brand: brand || '',
    rootCategory: rootCategory || 0,
    perPage: 50
  });
  
  const url = `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`;
  
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}`);
  
  try {
    const response = await axios.get(url, {
      decompress: true,
      timeout: 30000
    });
    
    const data = response.data;
    console.log(`✅ Keepa search returned ${data.asinList?.length || 0} ASINs`);
    return data.asinList || [];
  } catch (error) {
    if (error.response) {
      console.error('Keepa search error response:', error.response.data);
      throw new Error(`Keepa search error: ${error.response.status}`);
    }
    throw error;
  }
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
    const answer = await callClaude(prompt);
    return answer.toUpperCase().trim().includes('YES');
  } catch (error) {
    console.error(`AI evaluation failed for ${candidate.asin}:`, error.message);
    return false;
  }
}

// ==================== DATABASE ====================

async function getCorrelationsFromDB(asin, userId) {
  const { data: correlations, error: dbError } = await getSupabase()
    .from('asin_correlations')
    .select('*')
    .eq('search_asin', asin.toUpperCase())
    .eq('user_id', userId)  // IMPORTANT: Only return this user's data
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('❌ Database query error:', dbError);
    return { error: dbError, correlations: [] };
  }

  const formattedCorrelations = (correlations || []).map(row => ({
    asin: row.similar_asin,
    title: row.correlated_title,
    imageUrl: row.image_url,
    searchImageUrl: row.search_image_url,
    correlationScore: row.correlation_score ? parseFloat(row.correlation_score) / 100 : null,
    suggestedType: row.suggested_type,
    source: row.source,
    url: row.correlated_amazon_url
  }));

  return { error: null, correlations: formattedCorrelations };
}

async function writeCorrelationsToDB(asin, primaryData, correlations, userId) {
  if (!correlations.length) return;
  
  const records = correlations.map(item => ({
    user_id: userId,
    search_asin: asin,
    similar_asin: item.asin,
    correlated_title: item.title,
    image_url: item.image,
    search_image_url: primaryData.image,
    suggested_type: item.type,
    source: 'serverless-v2',
    correlated_amazon_url: item.url
  }));
  
  const { error } = await getSupabase()
    .from('asin_correlations')
    .upsert(records, { 
      onConflict: 'user_id,search_asin,similar_asin',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error('❌ Database write error:', error);
    throw error;
  }
  
  console.log(`✅ Wrote ${records.length} correlations to database`);
}

// ==================== MAIN PROCESSING ====================

async function processAsin(asin, userId, keepaKey) {
  console.log(`🔄 Processing ASIN: ${asin}`);
  
  // 1. Get primary product
  console.log('📦 Fetching primary product...');
  const primaryProducts = await keepaProductLookup(asin, keepaKey);
  
  if (!primaryProducts.length) {
    return { error: 'Product not found', correlations: [] };
  }
  
  const primary = primaryProducts[0];
  const primaryData = {
    asin: primary.asin,
    title: primary.title || 'Unknown',
    brand: primary.brand || 'Unknown',
    image: getImageUrl(primary),
    url: getAmazonUrl(primary.asin)
  };
  
  // 2. Get variations
  const variationAsins = (primary.variations || [])
    .map(v => v.asin)
    .filter(a => a !== asin);
  
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
  
  // 3. Search for similar products (same brand + category)
  let similarProducts = [];
  
  if (primary.brand && primary.rootCategory) {
    console.log('🔍 Searching for similar products...');
    try {
      const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey);
      
      const excludeSet = new Set([asin, ...variationAsins]);
      const candidateAsins = similarAsins
        .filter(a => !excludeSet.has(a))
        .slice(0, 5);  // Limit to 5 for speed
      
      if (candidateAsins.length > 0) {
        const candidateProducts = await keepaProductLookup(candidateAsins, keepaKey);
        
        console.log(`🤖 AI evaluating ${candidateProducts.length} candidates...`);
        
        // Parallel AI evaluation
        const results = await Promise.all(
          candidateProducts.map(async (candidate) => {
            const candidateData = {
              asin: candidate.asin,
              title: candidate.title || 'Unknown',
              brand: candidate.brand || 'Unknown',
              image: getImageUrl(candidate),
              url: getAmazonUrl(candidate.asin)
            };
            
            try {
              const isApproved = await evaluateSimilarity(primaryData, candidateData);
              return isApproved ? { ...candidateData, type: 'similar' } : null;
            } catch (e) {
              console.error(`AI eval failed for ${candidate.asin}:`, e.message);
              return null;
            }
          })
        );
        
        similarProducts = results.filter(Boolean);
        console.log(`✅ ${similarProducts.length}/${candidateProducts.length} candidates approved`);
      }
    } catch (searchError) {
      console.error('Similar search failed:', searchError.message);
      // Continue without similar products
    }
  } else {
    console.log('⏭️ Skipping similar search (no brand or category)');
  }
  
  
  // 5. Combine and write to DB
  const allCorrelations = [...variations, ...similarProducts];
  
  await writeCorrelationsToDB(asin, primaryData, allCorrelations, userId);
  
  return {
    primaryAsin: asin,
    primaryTitle: primaryData.title,
    correlations: allCorrelations,
    variationCount: variations.length,
    similarCount: similarProducts.length
  };
}

// ==================== HANDLER ====================

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
    // Auth
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    
    // Parse request
    const { asin, action = 'check', keepaKey } = JSON.parse(event.body);
    
    if (!asin || !/^B[0-9A-Z]{9}$/i.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Valid ASIN required (B + 9 chars)' })
      };
    }
    
    const normalizedAsin = asin.toUpperCase();
    
    // ACTION: CHECK
    if (action === 'check') {
      const { error, correlations } = await getCorrelationsFromDB(normalizedAsin, user.id);
      
      if (error) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Database error' }) };
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          asin: normalizedAsin,
          exists: correlations.length > 0,
          correlations,
          count: correlations.length,
          source: 'database'
        })
      };
    }
    
    // ACTION: SYNC
    if (action === 'sync') {
      // Get Keepa key: request body > user's stored key > env fallback
      let apiKey = keepaKey;
      
      if (!apiKey) {
        // Try to get from user's stored keys
        apiKey = await getUserApiKey(user.id, 'keepa');
      }
      
      if (!apiKey) {
        // Fall back to env (admin's key)
        apiKey = process.env.KEEPA_API_KEY;
      }
      
      if (!apiKey) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Keepa API key required',
            message: 'Please add your Keepa API key in Settings > API Keys'
          })
        };
      }
      
      // Check for Anthropic key
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'AI service not configured' })
        };
      }
      
      // Process immediately (may take 30-60s)
      console.log('🚀 Starting processAsin with KEEPA_KEY length:', apiKey.length);
      console.log('🔑 ANTHROPIC_KEY set:', !!process.env.ANTHROPIC_API_KEY);
      const result = await processAsin(normalizedAsin, user.id, apiKey);
      
      if (result.error) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: result.error })
        };
      }
      
      // Fetch final results from DB
      const { correlations } = await getCorrelationsFromDB(normalizedAsin, user.id);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          asin: normalizedAsin,
          exists: true,
          correlations,
          count: correlations.length,
          source: 'serverless',
          synced: true,
          stats: {
            variations: result.variationCount,
            similar: result.similarCount
          }
        })
      };
    }
    
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action' })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Processing failed',
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5)
      })
    };
  }
};
