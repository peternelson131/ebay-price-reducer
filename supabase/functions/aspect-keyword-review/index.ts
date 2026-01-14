import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Claude API call
async function callClaude(prompt: string, anthropicKey: string): Promise<string> {
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
      messages: [{
        role: 'user',
        content: prompt
      }],
      system: `You analyze product titles and extract keyword patterns for eBay listing aspects.

You will receive:
- aspect_name: The eBay aspect that needs a value
- product_title: The product title from Amazon/Keepa
- category_name: The eBay category
- keepa_brand: Brand from Keepa (if available)
- keepa_model: Model from Keepa (if available)

Respond with JSON only (no markdown):
{"aspect_value": "exact value for eBay", "keyword_pattern": "regex pattern to match similar products", "confidence": "high or low"}

IMPORTANT - Use EXACT eBay-accepted values:
- For "Department": Men, Women, Unisex Adults, Boys, Girls, Unisex Kids, Baby
- For backpacks/bags without gender keywords: use "Unisex Adults" with HIGH confidence

Rules:
- aspect_value must be an EXACT eBay-accepted value (check the list above)
- keyword_pattern should be a regex that would match this pattern in other product titles
- confidence is "high" if you're confident, "low" only if truly uncertain

Examples:
- For "Brand" aspect with title "Nike Air Max 90 Running Shoes", respond: {"aspect_value": "Nike", "keyword_pattern": "\\bNike\\b", "confidence": "high"}
- For "Department" aspect with title "Puma Backpack Bag", respond: {"aspect_value": "Unisex Adults", "keyword_pattern": "Backpack|Bag", "confidence": "high"}`
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
    // Try to extract JSON from response
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
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
        // Build prompt for Claude
        const prompt = `Analyze this product and extract the eBay aspect value:

aspect_name: ${miss.aspect_name}
product_title: ${miss.product_title}
category_name: ${miss.category_name}
keepa_brand: ${miss.keepa_brand || 'N/A'}
keepa_model: ${miss.keepa_model || 'N/A'}

Respond with JSON only.`

        // Call Claude
        const aiResponse = await callClaude(prompt, anthropicKey)
        const parsed = parseAIResponse(aiResponse)

        if (!parsed) {
          // Failed to parse - flag for review
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

        if (parsed.confidence === 'high') {
          // High confidence - auto-insert keyword pattern
          // Insert keyword pattern (skip if duplicate)
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

          // Mark as processed
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
          // Low confidence - flag for review
          await supabase
            .from('ebay_aspect_misses')
            .update({
              status: 'review_needed',
              suggested_value: parsed.aspect_value,
              suggested_pattern: parsed.keyword_pattern,
              notes: 'Low confidence - needs manual review',
              reviewed_at: new Date().toISOString()
            })
            .eq('id', miss.id)

          flaggedForReview++
        }

        processed++

        // Small delay between API calls
        await new Promise(r => setTimeout(r, 200))

      } catch (itemError) {
        console.error(`Error processing miss ${miss.id}:`, itemError)
        // Mark as error
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
