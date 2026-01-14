/**
 * ASIN Correlation Edge Function
 * 
 * Supabase Edge Function (Deno) - 150 second timeout on free tier
 * Full workflow: Keepa lookup → Variations → Similar search → AI evaluation → Save
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ==================== KEEPA API ====================

async function keepaProductLookup(asins: string | string[], keepaKey: string) {
  const asinString = Array.isArray(asins) ? asins.join(',') : asins
  const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asinString}`
  
  console.log(`📦 Keepa lookup: ${Array.isArray(asins) ? asins.length : 1} ASINs`)
  
  const response = await fetch(url)
  const data = await response.json()
  
  if (data.error) {
    throw new Error(`Keepa error: ${data.error.message || JSON.stringify(data.error)}`)
  }
  
  console.log(`✅ Keepa returned ${data.products?.length || 0} products`)
  return data.products || []
}

async function keepaProductSearch(brand: string, rootCategory: number, keepaKey: string) {
  const query: Record<string, unknown> = { perPage: 100 }  // Max 100 for better coverage
  if (brand) query.brand = [brand]
  if (rootCategory) query.rootCategory = [rootCategory]
  
  const selection = JSON.stringify(query)
  const url = `https://api.keepa.com/query?key=${keepaKey}&domain=1&selection=${encodeURIComponent(selection)}`
  
  console.log(`🔍 Keepa search: brand="${brand}", category=${rootCategory}`)
  
  const response = await fetch(url)
  const data = await response.json()
  
  if (data.error) {
    console.error('Keepa search error:', data.error)
    return []
  }
  
  console.log(`✅ Keepa search returned ${data.asinList?.length || 0} ASINs`)
  return data.asinList || []
}

// ==================== AI EVALUATION ====================

async function callClaude(prompt: string, anthropicKey: string): Promise<string> {
  console.log(`🤖 Calling Claude API...`)
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',  // Match n8n workflow
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }]
    })
  })
  
  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Claude API error: ${response.status} - ${errorText}`)
    throw new Error(`Claude API error: ${response.status} - ${errorText}`)
  }
  
  const data = await response.json()
  console.log(`✅ Claude response: ${data.content[0].text}`)
  return data.content[0].text
}

interface ProductData {
  asin: string
  title: string
  brand: string
  image: string
  url: string
}

async function evaluateSimilarity(primary: ProductData, candidate: ProductData, anthropicKey: string, customPrompt?: string): Promise<boolean> {
  let prompt: string;
  
  if (customPrompt) {
    // Use user's custom prompt
    prompt = customPrompt
      .replace('{primary_title}', primary.title)
      .replace('{primary_brand}', primary.brand || 'Unknown')
      .replace('{candidate_asin}', candidate.asin)
      .replace('{candidate_title}', candidate.title)
      .replace('{candidate_brand}', candidate.brand || 'Unknown');
  } else {
    // Default prompt - accept same product TYPE from same brand
    prompt = `PRIMARY PRODUCT:
Title: ${primary.title}
Brand: ${primary.brand || 'Unknown'}

CANDIDATE PRODUCT:
ASIN: ${candidate.asin}
Title: ${candidate.title}
Brand: ${candidate.brand || 'Unknown'}

Question: Is the CANDIDATE a similar product that a shopper might also consider?

Answer YES if:
- Same brand (include ALL products from the same brand)
- Candidate is a variant (different color, size, model number)
- Candidate is a different model in the same product line
- Candidate is a bundle or multi-pack of the same product
- Candidate is an accessory for the primary product (charger, cable, case, adapter, stand)
- Both serve the same primary purpose

Answer NO if:
- Different brand entirely
- Completely unrelated product category with different brand

Answer with ONLY: YES or NO`;
  }

  try {
    const answer = await callClaude(prompt, anthropicKey)
    return answer.toUpperCase().trim().includes('YES')
  } catch (error) {
    console.error(`AI eval failed for ${candidate.asin}:`, error)
    return false
  }
}

// Parallel AI evaluation
async function evaluateBatch(primary: ProductData, candidates: ProductData[], anthropicKey: string, concurrency = 5, customPrompt?: string) {
  const results: Array<ProductData & { approved: boolean }> = []
  
  for (let i = 0; i < candidates.length; i += concurrency) {
    const batch = candidates.slice(i, i + concurrency)
    const batchPromises = batch.map(async (candidate) => {
      const approved = await evaluateSimilarity(primary, candidate, anthropicKey, customPrompt)
      return { ...candidate, approved }
    })
    
    const batchResults = await Promise.all(batchPromises)
    results.push(...batchResults)
    console.log(`🤖 Evaluated ${Math.min(i + concurrency, candidates.length)}/${candidates.length}`)
  }
  
  return results
}

// ==================== HELPERS ====================

interface KeepaProduct {
  asin: string
  title?: string
  brand?: string
  images?: Array<{ l?: string; m?: string }>
  variations?: Array<{ asin: string }>
  rootCategory?: number
}

function getImageUrl(product: KeepaProduct): string {
  if (!product?.images?.[0]) return ''
  const img = product.images[0].l || product.images[0].m || ''
  return img ? `https://m.media-amazon.com/images/I/${img}` : ''
}

function getAmazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`
}

// ==================== MAIN HANDLER ====================

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  
  try {
    const { asin, userId, action = 'sync' } = await req.json()
    
    if (!asin || !userId) {
      return new Response(
        JSON.stringify({ error: 'asin and userId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const normalizedAsin = asin.toUpperCase()
    
    // Get API keys from environment
    const keepaKey = Deno.env.get('KEEPA_API_KEY')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!keepaKey) {
      return new Response(
        JSON.stringify({ error: 'KEEPA_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    
    // ACTION: CHECK - just return existing data
    if (action === 'check') {
      const { data: correlations, error } = await supabase
        .from('asin_correlations')
        .select('*')
        .eq('search_asin', normalizedAsin)
        .eq('user_id', userId)
      
      if (error) {
        throw error
      }
      
      const formatted = (correlations || []).map((row: Record<string, unknown>) => ({
        asin: row.similar_asin,
        title: row.correlated_title,
        imageUrl: row.image_url,
        suggestedType: row.suggested_type,
        url: row.correlated_amazon_url
      }))
      
      return new Response(
        JSON.stringify({
          success: true,
          asin: normalizedAsin,
          exists: formatted.length > 0,
          correlations: formatted,
          count: formatted.length,
          source: 'database'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // ACTION: SYNC - full workflow
    console.log(`🚀 Starting ASIN correlation for ${normalizedAsin}`)
    
    // Check if user has custom matching enabled
    let customPrompt: string | undefined
    const { data: userData } = await supabase
      .from('users')
      .select('custom_matching_enabled, custom_matching_prompt')
      .eq('id', userId)
      .single()
    
    if (userData?.custom_matching_enabled && userData?.custom_matching_prompt) {
      customPrompt = userData.custom_matching_prompt
      console.log('📝 Using custom matching prompt for this user')
    }
    
    // 1. Get primary product
    console.log('📦 Fetching primary product...')
    const primaryProducts = await keepaProductLookup(normalizedAsin, keepaKey)
    
    if (!primaryProducts.length) {
      return new Response(
        JSON.stringify({ error: 'Product not found on Amazon' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    const primary = primaryProducts[0] as KeepaProduct
    const primaryData: ProductData = {
      asin: primary.asin,
      title: primary.title || 'Unknown',
      brand: primary.brand || 'Unknown',
      image: getImageUrl(primary),
      url: getAmazonUrl(primary.asin)
    }
    
    console.log(`📦 Primary: "${primaryData.title.substring(0, 50)}..."`)
    
    // 2. Get variation ASINs
    const variationAsins = (primary.variations || [])
      .map((v: { asin: string }) => v.asin)
      .filter((a: string) => a !== normalizedAsin)
    
    console.log(`📦 Found ${variationAsins.length} variation ASINs`)
    
    // Debug info (collected throughout)
    const debug: Record<string, unknown> = {
      hasBrand: !!primary.brand,
      hasCategory: !!primary.rootCategory,
      hasAIKey: !!anthropicKey,
      brand: primary.brand,
      category: primary.rootCategory
    }
    
    // 3. Fetch and save variations (auto-approved, no AI needed)
    const allCorrelations: Array<{ asin: string; title: string; image: string; url: string; type: string }> = []
    
    if (variationAsins.length > 0) {
      const batchSize = Math.min(variationAsins.length, 20)
      console.log(`📦 Fetching ${batchSize} variation details...`)
      
      const variationProducts = await keepaProductLookup(variationAsins.slice(0, 20), keepaKey)
      
      for (const p of variationProducts as KeepaProduct[]) {
        allCorrelations.push({
          asin: p.asin,
          title: p.title || 'Unknown',
          image: getImageUrl(p),
          url: getAmazonUrl(p.asin),
          type: 'variation'
        })
      }
      console.log(`✅ Got ${allCorrelations.length} variations`)
    }
    
    // 4. Search for similar products (if we have brand + category + AI key)
    console.log(`🔍 Similar search check: brand="${primary.brand}", category=${primary.rootCategory}, hasAIKey=${!!anthropicKey}`)
    if (primary.brand && primary.rootCategory && anthropicKey) {
      console.log('🔍 Searching for similar products...')
      
      try {
        const similarAsins = await keepaProductSearch(primary.brand, primary.rootCategory, keepaKey)
        debug.searchResultCount = similarAsins.length
        console.log(`🔍 Keepa search returned ${similarAsins.length} ASINs`)
        const excludeSet = new Set([normalizedAsin, ...variationAsins])
        console.log(`🔍 Exclude set: ${[...excludeSet]}`)
        const candidateAsins = similarAsins.filter((a: string) => !excludeSet.has(a)).slice(0, 30)
        debug.candidateCount = candidateAsins.length
        debug.candidateAsins = candidateAsins
        console.log(`🔍 Candidate ASINs after filter: ${candidateAsins.length} - ${candidateAsins}`)
        
        if (candidateAsins.length > 0) {
          console.log(`📦 Fetching ${candidateAsins.length} candidate details...`)
          const candidateProducts = await keepaProductLookup(candidateAsins, keepaKey)
          
          const candidates: ProductData[] = (candidateProducts as KeepaProduct[]).map((p) => ({
            asin: p.asin,
            title: p.title || 'Unknown',
            brand: p.brand || 'Unknown',
            image: getImageUrl(p),
            url: getAmazonUrl(p.asin)
          }))
          
          console.log(`🤖 AI evaluating ${candidates.length} candidates...`)
          debug.aiStarted = true
          debug.usingCustomPrompt = !!customPrompt
          try {
            const evaluated = await evaluateBatch(primaryData, candidates, anthropicKey, 5, customPrompt)
            debug.aiCompleted = true
            debug.aiResults = evaluated.map(c => ({ asin: c.asin, approved: c.approved }))
            const approved = evaluated.filter(c => c.approved)
            
            console.log(`✅ AI approved ${approved.length}/${candidates.length}`)
            debug.aiApprovedCount = approved.length
          
          for (const c of approved) {
            allCorrelations.push({
              asin: c.asin,
              title: c.title,
              image: c.image,
              url: c.url,
              type: 'similar'
            })
          }
          } catch (aiErr) {
            console.error('AI evaluation failed:', aiErr)
            debug.aiError = String(aiErr)
          }
        }
      } catch (err) {
        console.error('Similar search failed:', err)
        debug.similarError = String(err)
        // Continue - we still have variations
      }
    } else if (!anthropicKey) {
      console.log('⏭️ Skipping AI evaluation (no ANTHROPIC_API_KEY)')
    } else {
      console.log('⏭️ Skipping similar search (no brand or category)')
    }
    
    // 5. Save all correlations to database
    if (allCorrelations.length > 0) {
      console.log(`💾 Saving ${allCorrelations.length} correlations...`)
      
      const records = allCorrelations.map(item => ({
        user_id: userId,
        search_asin: normalizedAsin,
        similar_asin: item.asin,
        correlated_title: item.title,
        image_url: item.image,
        search_image_url: primaryData.image,
        suggested_type: item.type,
        source: 'supabase-edge',
        correlated_amazon_url: item.url
      }))
      
      console.log(`💾 First record:`, JSON.stringify(records[0]))
      
      // Log what we're trying to write
      console.log(`💾 Attempting upsert of ${records.length} records`)
      console.log(`💾 Supabase URL: ${supabaseUrl}`)
      console.log(`💾 Has service key: ${!!supabaseServiceKey}`)
      
      const { data: upsertData, error: upsertError, status, statusText } = await supabase
        .from('asin_correlations')
        .upsert(records, { 
          onConflict: 'user_id,search_asin,similar_asin',
          ignoreDuplicates: false 
        })
        .select()
      
      console.log(`💾 Upsert response: status=${status}, statusText=${statusText}`)
      console.log(`💾 Upsert data: ${JSON.stringify(upsertData?.length || 0)} rows`)
      
      if (upsertError) {
        console.error('❌ Database write error:', upsertError)
        debug.dbError = upsertError.message || String(upsertError)
        debug.dbErrorDetails = upsertError
        debug.dbStatus = status
      } else {
        console.log(`✅ Saved ${upsertData?.length || 0} correlations`)
        debug.dbSaved = upsertData?.length || 0
        debug.dbStatus = status
      }
    }
    
    // 6. Return results
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1)
    const variationCount = allCorrelations.filter(c => c.type === 'variation').length
    const similarCount = allCorrelations.filter(c => c.type === 'similar').length
    
    console.log(`✅ Complete in ${elapsedSec}s: ${variationCount} variations + ${similarCount} similar`)
    console.log(`🔍 Debug:`, debug)
    
    // Format for response
    const formatted = allCorrelations.map(c => ({
      asin: c.asin,
      title: c.title,
      imageUrl: c.image,
      suggestedType: c.type,
      url: c.url
    }))
    
    return new Response(
      JSON.stringify({
        success: true,
        asin: normalizedAsin,
        exists: formatted.length > 0,
        correlations: formatted,
        count: formatted.length,
        source: 'supabase-edge',
        synced: true,
        stats: {
          variations: variationCount,
          similar: similarCount
        },
        debug,
        elapsedSeconds: parseFloat(elapsedSec),
        message: formatted.length > 0 
          ? `Found ${variationCount} variations + ${similarCount} similar products`
          : 'No variations or similar products found'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('❌ Error:', error)
    return new Response(
      JSON.stringify({ error: 'Processing failed', message: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
