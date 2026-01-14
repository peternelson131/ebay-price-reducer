/**
 * ASIN Correlation Background Function v2
 * 
 * OPTIMIZED for speed:
 * - Parallel AI evaluations (10 concurrent)
 * - Batch DB writes (all at once)
 * - Minimal status updates
 * 
 * Target: Match n8n's ~2 minute processing time
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Concurrency settings
const AI_CONCURRENCY = 10;  // Parallel AI calls
const KEEPA_BATCH_SIZE = 100; // Keepa supports up to 100 ASINs per call

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
  const selection = JSON.stringify({
    brand: brand || '',
    rootCategory: rootCategory || 0,
    perPage: 50
  });
  
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}`);
  
  const response = await axios.get(
    `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`,
    { decompress: true, timeout: 30000 }
  );
  
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
    throw new Error(`Claude API error: ${response.status} - ${error}`);
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
async function evaluateBatch(primary, candidates, concurrency = AI_CONCURRENCY) {
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

// ==================== JOB MANAGEMENT ====================

async function updateJobStatus(jobId, updates) {
  const { error } = await supabase
    .from('import_jobs')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', jobId);
  
  if (error) console.error(`Failed to update job ${jobId}:`, error.message);
}

// Batch write all correlations at once
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
    source: 'background-v2',
    correlated_amazon_url: item.url
  }));
  
  const { error } = await supabase
    .from('asin_correlations')
    .upsert(records, { 
      onConflict: 'user_id,search_asin,similar_asin',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error(`❌ Batch write failed:`, error.message);
    return 0;
  }
  
  console.log(`💾 Batch saved ${records.length} correlations`);
  return records.length;
}

// ==================== MAIN PROCESSING ====================

async function processInBackground(jobId, asin, userId, keepaKey) {
  const startTime = Date.now();
  console.log(`🚀 Background processing started for job ${jobId}`);
  
  try {
    await updateJobStatus(jobId, { status: 'processing' });
    
    // 1. Get primary product
    console.log('📦 Fetching primary product...');
    const primaryProducts = await keepaProductLookup(asin, keepaKey);
    
    if (!primaryProducts.length) {
      await updateJobStatus(jobId, { status: 'error', error_message: 'Product not found' });
      return;
    }
    
    const primary = primaryProducts[0];
    const primaryData = {
      asin: primary.asin,
      title: primary.title || 'Unknown',
      brand: primary.brand || 'Unknown',
      image: getImageUrl(primary),
      url: getAmazonUrl(primary.asin)
    };
    
    // 2. Collect ALL variation ASINs
    const variationAsins = (primary.variations || [])
      .map(v => v.asin)
      .filter(a => a !== asin);
    
    console.log(`📦 Found ${variationAsins.length} variations`);
    
    // 3. Fetch ALL variations in ONE Keepa call (up to 100)
    const variations = [];
    if (variationAsins.length > 0) {
      // Keepa supports up to 100 ASINs per request
      for (let i = 0; i < variationAsins.length; i += KEEPA_BATCH_SIZE) {
        const batch = variationAsins.slice(i, i + KEEPA_BATCH_SIZE);
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
    }
    
    // 4. Get similar products (if brand exists)
    const similarCandidates = [];
    if (primary.brand && primary.rootCategory) {
      console.log('🔍 Searching for similar products...');
      try {
        const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey);
        const excludeSet = new Set([asin, ...variationAsins]);
        const candidateAsins = similarAsins.filter(a => !excludeSet.has(a)).slice(0, 30);
        
        if (candidateAsins.length > 0) {
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
    }
    
    const totalCount = variations.length + similarCandidates.length;
    await updateJobStatus(jobId, { total_count: totalCount });
    console.log(`📊 Total: ${variations.length} variations + ${similarCandidates.length} similar = ${totalCount}`);
    
    // 5. Variations are AUTO-APPROVED (no AI needed)
    // 6. Similar products need PARALLEL AI evaluation
    let approvedSimilar = [];
    if (similarCandidates.length > 0) {
      console.log(`🤖 Evaluating ${similarCandidates.length} similar products (${AI_CONCURRENCY} parallel)...`);
      const evaluated = await evaluateBatch(primaryData, similarCandidates, AI_CONCURRENCY);
      approvedSimilar = evaluated.filter(c => c.approved);
      console.log(`✅ ${approvedSimilar.length}/${similarCandidates.length} similar products approved`);
    }
    
    // 7. BATCH WRITE all approved items at once
    const allApproved = [...variations, ...approvedSimilar];
    const savedCount = await writeCorrelationsBatch(asin, primaryData, allApproved, userId);
    
    // 8. Done!
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    await updateJobStatus(jobId, {
      status: 'complete',
      processed_count: totalCount,
      approved_count: savedCount,
      rejected_count: similarCandidates.length - approvedSimilar.length,
      completed_at: new Date().toISOString()
    });
    
    console.log(`✅ Job complete in ${elapsedSec}s: ${savedCount} approved, ${similarCandidates.length - approvedSimilar.length} rejected`);
    
  } catch (error) {
    console.error('❌ Background processing error:', error);
    await updateJobStatus(jobId, { status: 'error', error_message: error.message });
  }
}

// ==================== HANDLER ====================

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  
  try {
    const { jobId, asin, userId, keepaKey } = JSON.parse(event.body);
    
    if (!jobId || !asin || !userId || !keepaKey) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
    }
    
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Job not found' }) };
    }
    
    // Start background processing
    processInBackground(jobId, asin.toUpperCase(), userId, keepaKey)
      .catch(err => console.error('Background error:', err));
    
    return {
      statusCode: 202,
      body: JSON.stringify({ success: true, message: 'Processing started', jobId })
    };
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
