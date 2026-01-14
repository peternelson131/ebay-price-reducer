/**
 * ASIN Correlation Background Function
 * 
 * Netlify Background Function (15 min timeout)
 * Processes ASIN correlations and writes directly to database.
 * 
 * Called by trigger-asin-correlation-v2.js for sync requests.
 */

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

// ==================== KEEPA API ====================

async function keepaProductLookup(asins, keepaKey) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins;
  console.log(`📦 Keepa lookup: ${Array.isArray(asins) ? asins.length : 1} ASINs`);
  
  const response = await axios.get(
    `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}`,
    { decompress: true, timeout: 60000 }
  );
  
  if (response.data.error) {
    throw new Error(`Keepa error: ${response.data.error.message || JSON.stringify(response.data.error)}`);
  }
  
  console.log(`✅ Keepa returned ${response.data.products?.length || 0} products`);
  return response.data.products || [];
}

async function keepaProductSearch(brand, rootCategory, keepaKey) {
  // Keepa Product Finder requires arrays for brand and rootCategory
  const query = {};
  
  if (brand) {
    query.brand = [brand];
  }
  
  if (rootCategory) {
    query.rootCategory = [rootCategory];
  }
  
  query.perPage = 50;  // Keepa minimum is 50, max is 10000
  
  const selection = JSON.stringify(query);
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}`);
  
  const response = await axios.get(
    `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`,
    { decompress: true, timeout: 30000 }
  );
  
  if (response.data.error) {
    console.error('Keepa search error:', response.data.error);
    return [];
  }
  
  console.log(`✅ Keepa search returned ${response.data.asinList?.length || 0} ASINs`);
  return response.data.asinList || [];
}

// ==================== AI EVALUATION ====================

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
    throw new Error(`Claude API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.content[0].text;
}

async function evaluateSimilarity(primary, candidate) {
  const prompt = `PRIMARY: "${primary.title}" (${primary.brand || 'Unknown'})
CANDIDATE: "${candidate.title}" (${candidate.brand || 'Unknown'})

Is CANDIDATE the same product or variant (color/size) of PRIMARY?
Answer YES for same product/variant. Answer NO for accessories, different products, or different model years.
Reply ONLY: YES or NO`;

  try {
    const answer = await callClaude(prompt);
    return answer.toUpperCase().trim().includes('YES');
  } catch (error) {
    console.error(`AI eval failed for ${candidate.asin}:`, error.message);
    return false;
  }
}

// Parallel AI evaluation with concurrency limit
async function evaluateBatch(primary, candidates, concurrency = 10) {
  const results = [];
  
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency);
    const batchPromises = batch.map(async (candidate) => {
      const approved = await evaluateSimilarity(primary, candidate);
      return { ...candidate, approved };
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    console.log(`🤖 Evaluated ${Math.min(i + concurrency, candidates.length)}/${candidates.length}`);
  }
  
  return results;
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

// ==================== DATABASE ====================

async function writeCorrelationsBatch(asin, primaryData, items, userId) {
  if (!items.length) return 0;
  
  const records = items.map(item => ({
    user_id: userId,
    search_asin: asin,
    similar_asin: item.asin,
    correlated_title: item.title,
    image_url: item.image,
    search_image_url: primaryData.image,
    suggested_type: item.type,
    source: 'netlify-background',
    correlated_amazon_url: item.url
  }));
  
  const { error } = await getSupabase()
    .from('asin_correlations')
    .upsert(records, { 
      onConflict: 'user_id,search_asin,similar_asin',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error(`❌ Batch write failed:`, error.message);
    return 0;
  }
  
  console.log(`💾 Saved ${records.length} correlations to database`);
  return records.length;
}

// ==================== MAIN PROCESSING ====================

async function processAsin(asin, userId, keepaKey) {
  const startTime = Date.now();
  console.log(`🚀 Background processing ASIN: ${asin} for user: ${userId}`);
  
  try {
    // 1. Get primary product
    console.log('📦 Fetching primary product...');
    const primaryProducts = await keepaProductLookup(asin, keepaKey);
    
    if (!primaryProducts.length) {
      console.error('❌ Product not found');
      return { error: 'Product not found' };
    }
    
    const primary = primaryProducts[0];
    const primaryData = {
      asin: primary.asin,
      title: primary.title || 'Unknown',
      brand: primary.brand || 'Unknown',
      image: getImageUrl(primary),
      url: getAmazonUrl(primary.asin)
    };
    
    console.log(`📦 Primary: "${primaryData.title}" by ${primaryData.brand}`);
    
    // 2. Collect variation ASINs
    const variationAsins = (primary.variations || [])
      .map(v => v.asin)
      .filter(a => a !== asin);
    
    console.log(`📦 Found ${variationAsins.length} variation ASINs`);
    
    // 3. Fetch variation details (up to 100 per Keepa call)
    const variations = [];
    if (variationAsins.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < variationAsins.length; i += batchSize) {
        const batch = variationAsins.slice(i, i + batchSize);
        const products = await keepaProductLookup(batch, keepaKey);
        
        for (const p of products) {
          variations.push({
            asin: p.asin,
            title: p.title || 'Unknown',
            brand: p.brand || 'Unknown',
            image: getImageUrl(p),
            url: getAmazonUrl(p.asin),
            type: 'variation'
          });
        }
      }
      console.log(`✅ Fetched ${variations.length} variation details`);
    }
    
    // 4. Search for similar products (same brand + category)
    const similarCandidates = [];
    if (primary.brand && primary.rootCategory) {
      console.log('🔍 Searching for similar products...');
      try {
        const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey);
        const excludeSet = new Set([asin, ...variationAsins]);
        const candidateAsins = similarAsins.filter(a => !excludeSet.has(a)).slice(0, 30);
        
        if (candidateAsins.length > 0) {
          console.log(`📦 Fetching ${candidateAsins.length} candidate details...`);
          const products = await keepaProductLookup(candidateAsins, keepaKey);
          
          for (const p of products) {
            similarCandidates.push({
              asin: p.asin,
              title: p.title || 'Unknown',
              brand: p.brand || 'Unknown',
              image: getImageUrl(p),
              url: getAmazonUrl(p.asin),
              type: 'similar'
            });
          }
        }
      } catch (err) {
        console.error('Similar search failed:', err.message);
      }
    } else {
      console.log('⏭️ Skipping similar search (no brand or category)');
    }
    
    console.log(`📊 Found: ${variations.length} variations + ${similarCandidates.length} similar candidates`);
    
    // 5. Variations are AUTO-APPROVED
    // 6. Similar products need AI evaluation
    let approvedSimilar = [];
    if (similarCandidates.length > 0) {
      console.log(`🤖 AI evaluating ${similarCandidates.length} candidates...`);
      const evaluated = await evaluateBatch(primaryData, similarCandidates, 10);
      approvedSimilar = evaluated.filter(c => c.approved);
      console.log(`✅ AI approved ${approvedSimilar.length}/${similarCandidates.length}`);
    }
    
    // 7. Write all approved items to database
    const allApproved = [...variations, ...approvedSimilar];
    const savedCount = await writeCorrelationsBatch(asin, primaryData, allApproved, userId);
    
    // 8. Done!
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Complete in ${elapsedSec}s: ${savedCount} saved (${variations.length} variations + ${approvedSimilar.length} similar)`);
    
    return {
      success: true,
      asin,
      variationCount: variations.length,
      similarCount: approvedSimilar.length,
      savedCount,
      elapsedSeconds: parseFloat(elapsedSec)
    };
    
  } catch (error) {
    console.error('❌ Processing error:', error);
    return { error: error.message };
  }
}

// ==================== HANDLER ====================

exports.handler = async (event, context) => {
  // Background functions don't return responses to clients
  // They just process and exit
  
  console.log('🔔 Background function triggered');
  
  try {
    const body = JSON.parse(event.body || '{}');
    const { asin, userId } = body;
    
    if (!asin || !userId) {
      console.error('❌ Missing asin or userId');
      return { statusCode: 400 };
    }
    
    // Get Keepa key from env
    const keepaKey = process.env.KEEPA_API_KEY;
    if (!keepaKey) {
      console.error('❌ KEEPA_API_KEY not configured');
      return { statusCode: 500 };
    }
    
    // Check for Anthropic key
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      return { statusCode: 500 };
    }
    
    // Process the ASIN
    const result = await processAsin(asin.toUpperCase(), userId, keepaKey);
    
    console.log('📋 Result:', JSON.stringify(result));
    
    return { statusCode: 200 };
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    return { statusCode: 500 };
  }
};
