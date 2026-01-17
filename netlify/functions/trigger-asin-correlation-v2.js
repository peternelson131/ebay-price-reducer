/**
 * ASIN Correlation Trigger v2
 * 
 * Supports two modes:
 * 1. Native serverless processing (default)
 * 2. n8n webhook fallback (if FORCE_N8N=true)
 * 
 * For SaaS: Users provide their own Keepa API key
 */

const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

let supabase = null;

function getSupabase() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
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
  // Keepa Product Finder query format - arrays required for brand/rootCategory
  const query = {};
  
  // Brand must be an array of strings
  if (brand) {
    query.brand = [brand];
  }
  
  // rootCategory must be an array of numbers
  if (rootCategory) {
    query.rootCategory = [rootCategory];
  }
  
  query.perPage = 50;  // Keepa minimum is 50, max is 10000
  
  const selection = JSON.stringify(query);
  const url = `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`;
  
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}, query=${selection}`);
  
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
      throw new Error(`Keepa search error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
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
- Same clothing item besides color and size

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

/**
 * Get correlations from database, optionally filtering out those with completed tasks
 * @param {string} asin - The search ASIN
 * @param {string} userId - The user ID
 * @param {Object} options - Options
 * @param {boolean} options.includeCompleted - If true, include correlations with completed tasks (default: false)
 */
async function getCorrelationsFromDB(asin, userId, options = {}) {
  const { includeCompleted = false } = options;
  
  // Step 1: Get ASINs with completed tasks (unless includeCompleted is true)
  let completedAsins = new Set();
  
  if (!includeCompleted) {
    const { data: completedTasks, error: tasksError } = await getSupabase()
      .from('influencer_tasks')
      .select('asin')
      .eq('user_id', userId)
      .eq('status', 'completed');
    
    if (tasksError) {
      console.error('⚠️ Warning: Could not fetch completed tasks:', tasksError);
      // Continue anyway - better to show all than fail completely
    } else if (completedTasks?.length > 0) {
      completedAsins = new Set(completedTasks.map(t => t.asin));
      console.log(`🔍 Found ${completedAsins.size} ASINs with completed tasks to filter out`);
    }
  }
  
  // Step 2: Get correlations
  const { data: correlations, error: dbError } = await getSupabase()
    .from('asin_correlations')
    .select('*')
    .eq('search_asin', asin.toUpperCase())
    .eq('user_id', userId)  // IMPORTANT: Only return this user's data
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('❌ Database query error:', dbError);
    return { error: dbError, correlations: [], filteredCount: 0 };
  }

  // Step 3: Filter out correlations with completed tasks
  const allCorrelations = correlations || [];
  const filteredCorrelations = allCorrelations.filter(
    row => !completedAsins.has(row.similar_asin)
  );
  
  const filteredCount = allCorrelations.length - filteredCorrelations.length;
  if (filteredCount > 0) {
    console.log(`✅ Filtered out ${filteredCount} correlations with completed tasks`);
  }

  const formattedCorrelations = filteredCorrelations.map(row => ({
    asin: row.similar_asin,
    title: row.correlated_title,
    imageUrl: row.image_url,
    searchImageUrl: row.search_image_url,
    correlationScore: row.correlation_score ? parseFloat(row.correlation_score) / 100 : null,
    suggestedType: row.suggested_type,
    source: row.source,
    url: row.correlated_amazon_url
  }));

  return { error: null, correlations: formattedCorrelations, filteredCount };
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

// Helper to write a single correlation (for progressive saving)
async function writeSingleCorrelation(asin, primaryData, item, userId) {
  const record = {
    user_id: userId,
    search_asin: asin,
    similar_asin: item.asin,
    correlated_title: item.title,
    image_url: item.image,
    search_image_url: primaryData.image,
    suggested_type: item.type,
    source: 'serverless-v2',
    correlated_amazon_url: item.url
  };
  
  const { error } = await getSupabase()
    .from('asin_correlations')
    .upsert([record], { 
      onConflict: 'user_id,search_asin,similar_asin',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error(`❌ Failed to save ${item.asin}:`, error.message);
  } else {
    console.log(`💾 Saved: ${item.asin} (${item.type})`);
  }
}

// ==================== MAIN PROCESSING ====================

async function processAsin(asin, userId, keepaKey) {
  console.log(`🔄 Processing ASIN: ${asin}`);
  
  let variationCount = 0;
  let similarCount = 0;
  
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
  
  // 2. Get variations and SAVE IMMEDIATELY (progressive saving)
  const variationAsins = (primary.variations || [])
    .map(v => v.asin)
    .filter(a => a !== asin);
  
  if (variationAsins.length > 0) {
    console.log(`📦 Fetching ${variationAsins.length} variations...`);
    const variationProducts = await keepaProductLookup(variationAsins, keepaKey);
    
    // Save each variation immediately (don't wait until end)
    for (const p of variationProducts) {
      const variation = {
        asin: p.asin,
        title: p.title || 'Unknown',
        brand: p.brand || 'Unknown',
        image: getImageUrl(p),
        url: getAmazonUrl(p.asin),
        type: 'variation'
      };
      await writeSingleCorrelation(asin, primaryData, variation, userId);
      variationCount++;
    }
    console.log(`✅ Saved ${variationCount} variations`);
  }
  
  // 3. Search for similar products (same brand + category)
  if (primary.brand && primary.rootCategory) {
    console.log('🔍 Searching for similar products...');
    try {
      const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey);
      
      const excludeSet = new Set([asin, ...variationAsins]);
      const candidateAsins = similarAsins
        .filter(a => !excludeSet.has(a));
      // No limit - evaluate ALL candidates for maximum coverage
      
      if (candidateAsins.length > 0) {
        const candidateProducts = await keepaProductLookup(candidateAsins, keepaKey);
        
        console.log(`🤖 AI evaluating ${candidateProducts.length} candidates...`);
        
        // Evaluate and save each approved product immediately (progressive saving)
        for (const candidate of candidateProducts) {
          const candidateData = {
            asin: candidate.asin,
            title: candidate.title || 'Unknown',
            brand: candidate.brand || 'Unknown',
            image: getImageUrl(candidate),
            url: getAmazonUrl(candidate.asin)
          };
          
          try {
            const isApproved = await evaluateSimilarity(primaryData, candidateData);
            if (isApproved) {
              await writeSingleCorrelation(asin, primaryData, { ...candidateData, type: 'similar' }, userId);
              similarCount++;
            }
          } catch (e) {
            console.error(`AI eval failed for ${candidate.asin}:`, e.message);
          }
        }
        console.log(`✅ Approved and saved ${similarCount} similar products`);
      }
    } catch (searchError) {
      console.error('Similar search failed:', searchError.message);
      // Continue - variations may have been saved
    }
  } else {
    console.log('⏭️ Skipping similar search (no brand or category)');
  }
  
  return {
    primaryAsin: asin,
    primaryTitle: primaryData.title,
    variationCount,
    similarCount
  };
}

// ==================== HANDLER ====================

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;
  
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  try {
    // Use shared auth verification (same as catalog-import)
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      console.log('Auth failed:', authResult.error);
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const user = authResult.user;
    
    // Parse request
    const { asin, action = 'check', keepaKey, includeCompleted = false } = JSON.parse(event.body);
    
    if (!asin || !/^B[0-9A-Z]{9}$/i.test(asin)) {
      return errorResponse(400, 'Valid ASIN required (B + 9 chars)', headers);
    }
    
    const normalizedAsin = asin.toUpperCase();
    
    // ACTION: CHECK
    if (action === 'check') {
      // By default, filter out correlations with completed tasks
      // Pass includeCompleted: true to show all (useful for debugging)
      const { error, correlations, filteredCount } = await getCorrelationsFromDB(
        normalizedAsin, 
        user.id, 
        { includeCompleted }
      );
      
      if (error) {
        return errorResponse(500, 'Database error', headers);
      }
      
      return successResponse({
        success: true,
        asin: normalizedAsin,
        exists: correlations.length > 0,
        correlations,
        count: correlations.length,
        filteredCount: filteredCount || 0, // Number of correlations hidden due to completed tasks
        source: 'database'
      }, headers);
    }
    
    // ACTION: SYNC
    if (action === 'sync') {
      console.log(`🚀 Calling Supabase Edge Function for ASIN: ${normalizedAsin}`);
      
      try {
        // Call Supabase Edge Function (150 second timeout, full workflow)
        const edgeFunctionUrl = `${process.env.SUPABASE_URL}/functions/v1/asin-correlation`;
        
        const response = await axios.post(edgeFunctionUrl, {
          asin: normalizedAsin,
          userId: user.id,
          action: 'sync'
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_ANON_KEY}`
          },
          timeout: 160000  // 160 seconds (edge function has 150s limit)
        });
        
        console.log(`✅ Edge function returned:`, response.data);
        
        // Return the edge function response directly
        return successResponse(response.data, headers);
        
      } catch (syncError) {
        console.error('❌ Edge function error:', syncError.message);
        
        // If edge function fails, return error
        return errorResponse(500, `Sync failed: ${syncError.response?.data?.message || syncError.message}`, headers);
      }
    }
    
    return errorResponse(400, 'Invalid action', headers);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
    return errorResponse(500, `Processing failed: ${error.message}`, headers);
  }
};
