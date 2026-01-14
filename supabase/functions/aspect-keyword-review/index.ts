import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get eBay OAuth token
async function getEbayToken(clientId: string, clientSecret: string): Promise<string> {
  const credentials = btoa(`${clientId}:${clientSecret}`)
  const response = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`
    },
    body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
  })
  
  if (!response.ok) {
    throw new Error(`eBay token error: ${response.status}`)
  }
  
  const data = await response.json()
  return data.access_token
}

// Get valid aspect values from eBay API
async function getValidAspectValues(
  categoryId: string, 
  aspectName: string, 
  ebayToken: string
): Promise<{ values: string[], mode: string } | null> {
  try {
    const response = await fetch(
      `https://api.ebay.com/commerce/taxonomy/v1/category_tree/0/get_item_aspects_for_category?category_id=${categoryId}`,
      {
        headers: { 'Authorization': `Bearer ${ebayToken}` }
      }
    )
    
    if (!response.ok) return null
    
    const data = await response.json()
    const aspects = data.aspects || []
    
    for (const aspect of aspects) {
      if (aspect.localizedAspectName === aspectName) {
        const values = (aspect.aspectValues || []).map((v: any) => v.localizedValue)
        const mode = aspect.aspectConstraint?.aspectMode || 'FREE_TEXT'
        return { values, mode }
      }
    }
    
    return null
  } catch (e) {
    console.error('Error fetching eBay aspects:', e)
    return null
  }
}

// Claude API call with valid values constraint
async function callClaude(
  prompt: string, 
  anthropicKey: string,
  validValues: string[] | null,
  aspectMode: string
): Promise<string> {
  // Build system prompt based on whether we have valid values
  let systemPrompt = `You analyze product titles and extract keyword patterns for eBay listing aspects.

You will receive:
- aspect_name: The eBay aspect that needs a value
- product_title: The product title from Amazon/Keepa
- category_name: The eBay category
- keepa_brand: Brand from Keepa (if available)
- keepa_model: Model from Keepa (if available)
- valid_values: List of eBay-accepted values (if available)

Respond with JSON only (no markdown):
{"aspect_value": "exact value for eBay", "keyword_pattern": "regex pattern to match similar products", "confidence": "high or low"}

Rules:
- keyword_pattern should be a regex that would match this pattern in other product titles
- confidence is "high" if you're confident, "low" only if uncertain`

  if (validValues && validValues.length > 0 && aspectMode === 'SELECTION_ONLY') {
    systemPrompt += `

CRITICAL: This aspect is SELECTION_ONLY. You MUST pick from these exact values:
${validValues.map(v => `  - "${v}"`).join('\n')}

Do NOT invent new values. Pick the best match from the list above.
If the product is generic/unisex, pick the most general option (e.g., "Unisex Adults" for bags without gender).`
  } else if (validValues && validValues.length > 0) {
    systemPrompt += `

RECOMMENDED VALUES (pick from these when possible):
${validValues.slice(0, 50).map(v => `  - "${v}"`).join('\n')}
${validValues.length > 50 ? `  ... and ${validValues.length - 50} more` : ''}`
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
      system: systemPrompt
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${error}`)
  }

  const data = await response.json()
  return data.content?.[0]?.text || ''
}

// Parse AI response
function parseAIResponse(response: string): { aspect_value: string, keyword_pattern: string, confidence: string } | null {
  try {
    const jsonMatch = response.match(/\{[^}]+\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.error('Failed to parse AI response:', e)
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!
    const ebayClientId = Deno.env.get('EBAY_CLIENT_ID')!
    const ebayClientSecret = Deno.env.get('EBAY_CLIENT_SECRET')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get eBay token
    let ebayToken: string | null = null
    try {
      ebayToken = await getEbayToken(ebayClientId, ebayClientSecret)
    } catch (e) {
      console.error('Failed to get eBay token:', e)
    }

    // Get pending aspect misses (limit 10 per run)
    const { data: pendingMisses, error: fetchError } = await supabase
      .from('ebay_aspect_misses')
      .select('*')
      .eq('status', 'pending')
      .limit(10)

    if (fetchError) throw fetchError

    if (!pendingMisses || pendingMisses.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending misses', processed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${pendingMisses.length} pending aspect misses`)

    let processed = 0
    let autoInserted = 0
    let flaggedForReview = 0

    for (const miss of pendingMisses) {
      try {
        // Get valid values from eBay API
        let validValues: string[] | null = null
        let aspectMode = 'FREE_TEXT'
        
        if (ebayToken && miss.category_id) {
          const aspectInfo = await getValidAspectValues(miss.category_id, miss.aspect_name, ebayToken)
          if (aspectInfo) {
            validValues = aspectInfo.values
            aspectMode = aspectInfo.mode
            console.log(`Found ${validValues.length} valid values for ${miss.aspect_name} (${aspectMode})`)
          }
        }

        // Build prompt for Claude
        let prompt = `Analyze this product and extract the eBay aspect value:

aspect_name: ${miss.aspect_name}
product_title: ${miss.product_title}
category_name: ${miss.category_name}
keepa_brand: ${miss.keepa_brand || 'N/A'}
keepa_model: ${miss.keepa_model || 'N/A'}`

        if (validValues && validValues.length > 0) {
          prompt += `\nvalid_values: ${JSON.stringify(validValues.slice(0, 100))}`
        }

        prompt += '\n\nRespond with JSON only.'

        // Call Claude with valid values
        const aiResponse = await callClaude(prompt, anthropicKey, validValues, aspectMode)
        const parsed = parseAIResponse(aiResponse)

        if (!parsed) {
          await supabase
            .from('ebay_aspect_misses')
            .update({
              status: 'review_needed',
              notes: 'AI response could not be parsed',
              reviewed_at: new Date().toISOString()
            })
            .eq('id', miss.id)
          
          flaggedForReview++
          continue
        }

        // Validate that the value is in the valid list (for SELECTION_ONLY)
        let valueValid = true
        if (aspectMode === 'SELECTION_ONLY' && validValues) {
          valueValid = validValues.includes(parsed.aspect_value)
          if (!valueValid) {
            console.log(`AI suggested "${parsed.aspect_value}" but it's not in valid values`)
            // Try to find closest match
            const lowerValue = parsed.aspect_value.toLowerCase()
            const match = validValues.find(v => v.toLowerCase() === lowerValue)
            if (match) {
              parsed.aspect_value = match
              valueValid = true
            }
          }
        }

        if (parsed.confidence === 'high' && valueValid) {
          // High confidence - auto-insert keyword pattern
          const { error: insertError } = await supabase
            .from('ebay_aspect_keywords')
            .insert({
              aspect_name: miss.aspect_name,
              keyword_pattern: parsed.keyword_pattern,
              aspect_value: parsed.aspect_value,
              category_id: miss.category_id
            })
          
          if (insertError) {
            console.log(`Insert warning for ${miss.aspect_name}: ${insertError.message}`)
          }

          await supabase
            .from('ebay_aspect_misses')
            .update({
              status: 'processed',
              suggested_value: parsed.aspect_value,
              suggested_pattern: parsed.keyword_pattern,
              reviewed_at: new Date().toISOString()
            })
            .eq('id', miss.id)

          autoInserted++
        } else {
          // Low confidence or invalid value - flag for review
          const notes = !valueValid 
            ? `AI suggested "${parsed.aspect_value}" but it's not a valid eBay value`
            : 'Low confidence - needs manual review'
            
          await supabase
            .from('ebay_aspect_misses')
            .update({
              status: 'review_needed',
              suggested_value: parsed.aspect_value,
              suggested_pattern: parsed.keyword_pattern,
              notes,
              reviewed_at: new Date().toISOString()
            })
            .eq('id', miss.id)

          flaggedForReview++
        }

        processed++
        await new Promise(r => setTimeout(r, 200))

      } catch (itemError) {
        console.error(`Error processing miss ${miss.id}:`, itemError)
        await supabase
          .from('ebay_aspect_misses')
          .update({
            status: 'error',
            notes: `Error: ${itemError.message}`,
            reviewed_at: new Date().toISOString()
          })
          .eq('id', miss.id)
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        autoInserted,
        flaggedForReview,
        message: `Processed ${processed} aspect misses`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Aspect keyword review error:', error)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
