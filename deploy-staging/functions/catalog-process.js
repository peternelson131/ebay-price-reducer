/**
 * Catalog Process - Background processor for catalog imports
 * 
 * POST /catalog-process - Process pending catalog imports (webhook/scheduled)
 * 
 * Processes 15 pending imports per invocation:
 * 1. Fetch pending catalog_imports
 * 2. Call Keepa API to find variations/similar products
 * 3. Optionally use AI to filter correlations
 * 4. Update catalog_imports with results
 * 
 * Rate limiting:
 * - 15 ASINs per invocation (middle of 10-20 range)
 * - Keepa API: ~1 token per ASIN lookup
 * - Claude API: ~100 tokens per similarity check (if enabled)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyWebhookSecret, verifyAuthOrWebhook } = require('./utils/auth');
const axios = require('axios');

// Configuration
const BATCH_SIZE = 15;  // ASINs to process per invocation
const ENABLE_AI_FILTERING = false;  // Set true to use Claude for similarity filtering

// Lazy-init Supabase client
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

// ==================== USER API KEY HELPERS ====================

/**
 * Get user's Keepa API key (encrypted or from env as fallback)
 */
async function getUserKeepaKey(userId) {
  // Try user's own key first
  const { data, error } = await getSupabase()
    .from('user_api_keys')
    .select('api_key_encrypted')
    .eq('user_id', userId)
    .eq('service', 'keepa')
    .single();
  
  if (data?.api_key_encrypted) {
    // In production, decrypt here
    return data.api_key_encrypted;
  }
  
  // Fallback to system Keepa key
  return process.env.KEEPA_API_KEY;
}

// ==================== KEEPA API ====================

/**
 * Lookup products by ASIN(s) via Keepa API
 */
async function keepaProductLookup(asins, keepaKey) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins;
  const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}`;
  
  console.log(`📦 Keepa lookup: ${asinString.substring(0, 50)}...`);
  
  try {
    const response = await axios.get(url, {
      decompress: true,
      timeout: 30000
    });
    
    const data = response.data;
    
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

/**
 * Search Keepa for products by brand/category
 */
async function keepaProductSearch(brand, rootCategory, keepaKey) {
  const query = {};
  
  if (brand) query.brand = [brand];
  if (rootCategory) query.rootCategory = [rootCategory];
  query.perPage = 50;
  
  const selection = JSON.stringify(query);
  const url = `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`;
  
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}`);
  
  try {
    const response = await axios.get(url, {
      decompress: true,
      timeout: 30000
    });
    
    return response.data.asinList || [];
  } catch (error) {
    console.error('Keepa search error:', error.response?.data || error.message);
    return [];
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

/**
 * Extract correlations from Keepa product data
 * Returns array of related ASINs with metadata
 */
function extractCorrelations(product, searchAsin) {
  const correlations = [];
  const seen = new Set([searchAsin.toUpperCase()]);
  
  // 1. Variation ASINs (same product, different color/size)
  if (product.variations?.length > 0) {
    for (const variation of product.variations) {
      const varAsin = variation.asin;
      if (varAsin && !seen.has(varAsin)) {
        seen.add(varAsin);
        correlations.push({
          asin: varAsin,
          title: variation.title || product.title,
          imageUrl: variation.image ? `https://m.media-amazon.com/images/I/${variation.image}` : getImageUrl(product),
          type: 'variation',
          attributes: variation.attributes || {}
        });
      }
    }
  }
  
  // 2. Frequently Bought Together
  if (product.frequentlyBoughtTogether?.length > 0) {
    for (const fbtAsin of product.frequentlyBoughtTogether) {
      if (fbtAsin && !seen.has(fbtAsin)) {
        seen.add(fbtAsin);
        correlations.push({
          asin: fbtAsin,
          type: 'frequently_bought_together'
        });
      }
    }
  }
  
  // 3. Parent ASIN (if this is a child)
  if (product.parentAsin && !seen.has(product.parentAsin)) {
    seen.add(product.parentAsin);
    correlations.push({
      asin: product.parentAsin,
      type: 'parent'
    });
  }
  
  // 4. Same brand products (from related)
  if (product.brand) {
    // We'll enrich these later if needed
    correlations._brand = product.brand;
  }
  
  return correlations;
}

/**
 * Enrich correlation objects with full product data
 */
async function enrichCorrelations(correlations, keepaKey) {
  // Get ASINs that need enrichment
  const toEnrich = correlations
    .filter(c => !c.title && c.asin)
    .map(c => c.asin);
  
  if (toEnrich.length === 0) return correlations;
  
  // Lookup in batches of 100 (Keepa limit)
  const enriched = new Map();
  
  for (let i = 0; i < toEnrich.length; i += 100) {
    const batch = toEnrich.slice(i, i + 100);
    try {
      const products = await keepaProductLookup(batch, keepaKey);
      for (const p of products) {
        enriched.set(p.asin, {
          title: p.title,
          imageUrl: getImageUrl(p),
          brand: p.brand
        });
      }
    } catch (error) {
      console.warn(`Failed to enrich batch starting at ${i}:`, error.message);
    }
  }
  
  // Apply enrichment
  for (const correlation of correlations) {
    const data = enriched.get(correlation.asin);
    if (data) {
      correlation.title = correlation.title || data.title;
      correlation.imageUrl = correlation.imageUrl || data.imageUrl;
      correlation.brand = data.brand;
    }
  }
  
  return correlations;
}

// ==================== AI FILTERING ====================

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

/**
 * Use AI to filter correlations to only similar products
 */
async function filterCorrelationsWithAI(primary, correlations) {
  if (!ENABLE_AI_FILTERING || !process.env.ANTHROPIC_API_KEY) {
    return correlations;
  }
  
  const filtered = [];
  
  for (const candidate of correlations) {
    // Skip if no title to compare
    if (!candidate.title) {
      filtered.push(candidate); // Keep but mark as unverified
      continue;
    }
    
    // Variations are always similar by definition
    if (candidate.type === 'variation' || candidate.type === 'parent') {
      candidate.aiVerified = true;
      filtered.push(candidate);
      continue;
    }
    
    // Use AI for frequently_bought_together and other types
    const prompt = `PRIMARY: ${primary.title}
CANDIDATE: ${candidate.title}

Is the CANDIDATE the same type of product as PRIMARY (not an accessory)?
Answer ONLY: YES or NO`;

    try {
      const answer = await callClaude(prompt);
      const isSimilar = answer.toUpperCase().trim().includes('YES');
      
      if (isSimilar) {
        candidate.aiVerified = true;
        filtered.push(candidate);
      } else {
        console.log(`🚫 AI filtered out: ${candidate.asin} (${candidate.title?.substring(0, 50)})`);
      }
    } catch (error) {
      console.warn(`AI filtering failed for ${candidate.asin}:`, error.message);
      filtered.push(candidate); // Keep on error
    }
  }
  
  return filtered;
}

// ==================== MAIN PROCESSING ====================

/**
 * Process a single catalog import item
 */
async function processItem(item, keepaKey) {
  console.log(`🔄 Processing ASIN: ${item.asin}`);
  
  try {
    // Mark as processing
    await getSupabase()
      .from('catalog_imports')
      .update({ status: 'processing' })
      .eq('id', item.id);
    
    // Lookup product in Keepa
    const products = await keepaProductLookup(item.asin, keepaKey);
    
    if (!products || products.length === 0) {
      console.log(`⚠️ No Keepa data for ${item.asin}`);
      await getSupabase()
        .from('catalog_imports')
        .update({
          status: 'processed',
          correlation_count: 0,
          correlations: [],
          processed_at: new Date().toISOString()
        })
        .eq('id', item.id);
      return { asin: item.asin, correlations: 0 };
    }
    
    const product = products[0];
    
    // Extract correlations
    let correlations = extractCorrelations(product, item.asin);
    console.log(`📊 Found ${correlations.length} raw correlations for ${item.asin}`);
    
    // Enrich with full product data
    if (correlations.length > 0) {
      correlations = await enrichCorrelations(correlations, keepaKey);
    }
    
    // AI filtering (if enabled)
    if (ENABLE_AI_FILTERING && correlations.length > 0) {
      const primaryData = {
        title: product.title || item.title,
        brand: product.brand
      };
      correlations = await filterCorrelationsWithAI(primaryData, correlations);
      console.log(`🤖 After AI filtering: ${correlations.length} correlations`);
    }
    
    // Add Amazon URLs
    for (const c of correlations) {
      c.amazonUrl = getAmazonUrl(c.asin);
    }
    
    // Update database
    await getSupabase()
      .from('catalog_imports')
      .update({
        status: 'processed',
        correlation_count: correlations.length,
        correlations: correlations,
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    console.log(`✅ Processed ${item.asin}: ${correlations.length} correlations`);
    return { asin: item.asin, correlations: correlations.length };
    
  } catch (error) {
    console.error(`❌ Error processing ${item.asin}:`, error.message);
    
    // Mark as error
    await getSupabase()
      .from('catalog_imports')
      .update({
        status: 'error',
        error_message: error.message,
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    return { asin: item.asin, error: error.message };
  }
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;
  
  // Allow POST or scheduled invocations (empty body = Netlify scheduled trigger)
  const isScheduledInvocation = !event.body || event.body === '{}' || event.body === '';
  
  if (event.httpMethod !== 'POST' && !isScheduledInvocation) {
    return errorResponse(405, 'Method not allowed', headers);
  }
  
  try {
    // Scheduled invocations from Netlify don't need auth
    // Manual HTTP calls require webhook secret or user token
    if (!isScheduledInvocation) {
      const authResult = await verifyAuthOrWebhook(event);
      if (!authResult.success) {
        return errorResponse(authResult.statusCode, authResult.error, headers);
      }
    } else {
      console.log('✅ Scheduled invocation detected - no auth required');
    }
    
    // Parse body for optional parameters
    let body = {};
    try {
      body = JSON.parse(event.body || '{}');
    } catch (e) {
      // Ignore parse errors
    }
    
    // Optional: process specific user only
    const targetUserId = body.userId || null;
    const batchSize = Math.min(body.batchSize || BATCH_SIZE, 50);
    
    console.log(`🚀 Starting catalog processing (batch=${batchSize}${targetUserId ? `, user=${targetUserId}` : ''})`);
    
    // Fetch pending items
    let query = getSupabase()
      .from('catalog_imports')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(batchSize);
    
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }
    
    const { data: pendingItems, error: fetchError } = await query;
    
    if (fetchError) {
      console.error('Failed to fetch pending items:', fetchError);
      return errorResponse(500, 'Failed to fetch pending items', headers);
    }
    
    if (!pendingItems || pendingItems.length === 0) {
      console.log('📭 No pending items to process');
      return successResponse({
        success: true,
        message: 'No pending items to process',
        processed: 0
      }, headers);
    }
    
    console.log(`📋 Found ${pendingItems.length} pending items to process`);
    
    // Group by user to get their Keepa keys
    const userIds = [...new Set(pendingItems.map(i => i.user_id))];
    const keepaKeys = {};
    
    for (const userId of userIds) {
      keepaKeys[userId] = await getUserKeepaKey(userId);
      if (!keepaKeys[userId]) {
        console.error(`⚠️ No Keepa key available for user ${userId}`);
      }
    }
    
    // Process items
    const results = [];
    
    for (const item of pendingItems) {
      const keepaKey = keepaKeys[item.user_id];
      
      if (!keepaKey) {
        // Mark as error - no API key
        await getSupabase()
          .from('catalog_imports')
          .update({
            status: 'error',
            error_message: 'No Keepa API key configured',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);
        
        results.push({ asin: item.asin, error: 'No Keepa API key' });
        continue;
      }
      
      const result = await processItem(item, keepaKey);
      results.push(result);
      
      // Small delay between items to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    // Summary
    const processed = results.filter(r => !r.error).length;
    const errors = results.filter(r => r.error).length;
    const totalCorrelations = results.reduce((sum, r) => sum + (r.correlations || 0), 0);
    
    console.log(`✅ Processing complete: ${processed} processed, ${errors} errors, ${totalCorrelations} total correlations`);
    
    // Check if more items need processing
    const { count: remainingCount } = await getSupabase()
      .from('catalog_imports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');
    
    return successResponse({
      success: true,
      processed,
      errors,
      totalCorrelations,
      remaining: remainingCount || 0,
      results
    }, headers);
    
  } catch (error) {
    console.error('Catalog process error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
