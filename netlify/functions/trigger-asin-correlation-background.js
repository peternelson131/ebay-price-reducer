/**
 * ASIN Correlation Background Function
 * 
 * Background function that can run up to 15 minutes.
 * Processes all variations/candidates with AI evaluation.
 * Only AI-approved records are written to the database.
 * 
 * Flow:
 * 1. Client creates import_job, gets jobId
 * 2. Client calls this function with jobId
 * 3. Function returns 202 immediately
 * 4. Background: processes all items, saves approved ones
 * 5. Client polls job status or uses Supabase realtime
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ==================== KEEPA API ====================

async function keepaProductLookup(asins, keepaKey) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins;
  console.log(`📦 Keepa lookup: ${asinString.substring(0, 50)}...`);
  
  const response = await axios.get(
    `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}`,
    { decompress: true, timeout: 30000 }
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
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', jobId);
  
  if (error) {
    console.error(`Failed to update job ${jobId}:`, error.message);
  }
}

async function writeSingleCorrelation(asin, primaryData, item, userId) {
  const record = {
    user_id: userId,
    search_asin: asin,
    similar_asin: item.asin,
    correlated_title: item.title,
    image_url: item.image,
    search_image_url: primaryData.image,
    suggested_type: item.type,
    source: 'background-v1',
    correlated_amazon_url: item.url
  };
  
  const { error } = await supabase
    .from('asin_correlations')
    .upsert([record], { 
      onConflict: 'user_id,search_asin,similar_asin',
      ignoreDuplicates: false 
    });
  
  if (error) {
    console.error(`❌ Failed to save ${item.asin}:`, error.message);
    return false;
  }
  
  console.log(`💾 Saved: ${item.asin} (${item.type})`);
  return true;
}

// ==================== MAIN PROCESSING ====================

async function processInBackground(jobId, asin, userId, keepaKey) {
  console.log(`🚀 Background processing started for job ${jobId}`);
  
  let processedCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  
  try {
    // Update status to processing
    await updateJobStatus(jobId, { status: 'processing' });
    
    // 1. Get primary product
    console.log('📦 Fetching primary product...');
    const primaryProducts = await keepaProductLookup(asin, keepaKey);
    
    if (!primaryProducts.length) {
      await updateJobStatus(jobId, {
        status: 'error',
        error_message: 'Product not found on Amazon'
      });
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
    
    // 2. Collect ALL candidates to evaluate
    const allCandidates = [];
    
    // 2a. Get variations
    const variationAsins = (primary.variations || [])
      .map(v => v.asin)
      .filter(a => a !== asin);
    
    console.log(`📦 Found ${variationAsins.length} variations`);
    
    // Fetch variation details in batches of 20
    for (let i = 0; i < variationAsins.length; i += 20) {
      const batch = variationAsins.slice(i, i + 20);
      const variationProducts = await keepaProductLookup(batch, keepaKey);
      
      for (const p of variationProducts) {
        allCandidates.push({
          asin: p.asin,
          title: p.title || 'Unknown',
          brand: p.brand || 'Unknown',
          image: getImageUrl(p),
          url: getAmazonUrl(p.asin),
          type: 'variation'
        });
      }
    }
    
    // 2b. Get similar products
    if (primary.brand && primary.rootCategory) {
      console.log('🔍 Searching for similar products...');
      try {
        const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey);
        
        const excludeSet = new Set([asin, ...variationAsins]);
        const candidateAsins = similarAsins
          .filter(a => !excludeSet.has(a))
          .slice(0, 30); // Up to 30 similar products
        
        if (candidateAsins.length > 0) {
          // Fetch in batches
          for (let i = 0; i < candidateAsins.length; i += 20) {
            const batch = candidateAsins.slice(i, i + 20);
            const candidateProducts = await keepaProductLookup(batch, keepaKey);
            
            for (const p of candidateProducts) {
              allCandidates.push({
                asin: p.asin,
                title: p.title || 'Unknown',
                brand: p.brand || 'Unknown',
                image: getImageUrl(p),
                url: getAmazonUrl(p.asin),
                type: 'similar'
              });
            }
          }
        }
      } catch (searchError) {
        console.error('Similar search failed:', searchError.message);
        // Continue with variations only
      }
    }
    
    // Update total count
    const totalCount = allCandidates.length;
    await updateJobStatus(jobId, { total_count: totalCount });
    console.log(`📊 Total candidates to evaluate: ${totalCount}`);
    
    // 3. Evaluate each candidate with AI
    for (const candidate of allCandidates) {
      processedCount++;
      
      // Variations are auto-approved (same product, different variant)
      if (candidate.type === 'variation') {
        const saved = await writeSingleCorrelation(asin, primaryData, candidate, userId);
        if (saved) {
          approvedCount++;
        }
      } else {
        // Similar products need AI evaluation
        console.log(`🤖 Evaluating ${candidate.asin}...`);
        const isApproved = await evaluateSimilarity(primaryData, candidate);
        
        if (isApproved) {
          const saved = await writeSingleCorrelation(asin, primaryData, candidate, userId);
          if (saved) {
            approvedCount++;
          }
        } else {
          rejectedCount++;
          console.log(`❌ Rejected: ${candidate.asin} - not similar enough`);
        }
      }
      
      // Update progress every 5 items
      if (processedCount % 5 === 0) {
        await updateJobStatus(jobId, {
          processed_count: processedCount,
          approved_count: approvedCount,
          rejected_count: rejectedCount
        });
      }
    }
    
    // 4. Mark complete
    await updateJobStatus(jobId, {
      status: 'complete',
      processed_count: processedCount,
      approved_count: approvedCount,
      rejected_count: rejectedCount,
      completed_at: new Date().toISOString()
    });
    
    console.log(`✅ Job complete: ${approvedCount} approved, ${rejectedCount} rejected`);
    
  } catch (error) {
    console.error('❌ Background processing error:', error);
    await updateJobStatus(jobId, {
      status: 'error',
      error_message: error.message,
      processed_count: processedCount,
      approved_count: approvedCount,
      rejected_count: rejectedCount
    });
  }
}

// ==================== HANDLER ====================

exports.handler = async (event, context) => {
  // Background functions don't need CORS (not called directly from browser)
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }
  
  try {
    const { jobId, asin, userId, keepaKey } = JSON.parse(event.body);
    
    if (!jobId || !asin || !userId || !keepaKey) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields: jobId, asin, userId, keepaKey' })
      };
    }
    
    // Verify job exists
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', jobId)
      .single();
    
    if (jobError || !job) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'Job not found' })
      };
    }
    
    // Start background processing (don't await - let it run in background)
    processInBackground(jobId, asin.toUpperCase(), userId, keepaKey)
      .catch(err => console.error('Background process error:', err));
    
    // Return immediately with 202 Accepted
    return {
      statusCode: 202,
      body: JSON.stringify({
        success: true,
        message: 'Processing started',
        jobId
      })
    };
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
