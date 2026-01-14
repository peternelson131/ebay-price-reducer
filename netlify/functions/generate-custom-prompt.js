/**
 * Generate Custom AI Prompt
 * Analyzes user's accept/decline history and generates personalized matching criteria
 */

const { createClient } = require('@supabase/supabase-js');
const Anthropic = require('@anthropic-ai/sdk');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Verify auth
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authorization' }) };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }

    const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Get user's feedback from existing asin_correlations table
    const { data: feedbackData, error: feedbackError } = await supabaseAdmin
      .from('asin_correlations')
      .select('search_asin, similar_asin, correlated_title, decision, decline_reason, decision_at')
      .eq('user_id', user.id)
      .not('decision', 'is', null)
      .order('decision_at', { ascending: false })
      .limit(100);

    if (feedbackError) throw feedbackError;

    if (!feedbackData || feedbackData.length < 5) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Need at least 5 feedback entries to generate custom prompt',
          feedback_count: feedbackData?.length || 0
        })
      };
    }

    // Prepare examples for AI analysis
    const accepted = feedbackData.filter(f => f.decision === 'accepted');
    const declined = feedbackData.filter(f => f.decision === 'declined');

    const acceptedExamples = accepted.slice(0, 20).map(f => 
      `- ${f.search_asin} → ${f.similar_asin}: "${f.correlated_title || 'Unknown'}"`
    ).join('\n');

    const declinedExamples = declined.slice(0, 20).map(f => 
      `- ${f.search_asin} → ${f.similar_asin}: "${f.correlated_title || 'Unknown'}" (Reason: ${f.decline_reason || 'not specified'})`
    ).join('\n');

    // Count decline reasons
    const declineReasons = {};
    declined.forEach(f => {
      if (f.decline_reason) {
        declineReasons[f.decline_reason] = (declineReasons[f.decline_reason] || 0) + 1;
      }
    });

    // Generate custom prompt using Claude
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Default criteria that gets customized
    const defaultCriteria = `Answer YES if:
- Same or highly similar product type/category
- Same brand family or compatible brands
- Would reasonably substitute for or complement the primary product
- Customer searching for primary would likely want to see this

Answer NO if:
- Different product category entirely
- Accessory when primary is main product (or vice versa)
- Competing brand that user doesn't sell
- Quality tier mismatch (premium vs budget)`;

    const analysisPrompt = `You are analyzing a user's product matching preferences to customize their matching criteria.

CURRENT DEFAULT CRITERIA:
${defaultCriteria}

USER'S FEEDBACK DATA:
- Total decisions: ${feedbackData.length}
- Accepted: ${accepted.length}
- Declined: ${declined.length}
- Decline reasons breakdown: ${JSON.stringify(declineReasons)}

ACCEPTED MATCHES (user wants these types):
${acceptedExamples || 'No examples yet'}

DECLINED MATCHES (user doesn't want these):
${declinedExamples || 'No examples yet'}

Based on this user's feedback, create a CUSTOMIZED version of the matching criteria. Keep the same format but ADD, REMOVE, or MODIFY bullet points based on what you learned from their decisions.

Rules:
1. Keep the exact format: "Answer YES if:" followed by bullet points, then "Answer NO if:" followed by bullet points
2. Start with the default criteria as a base
3. ADD specific criteria based on patterns you see in their accepts/declines
4. REMOVE any default criteria that conflicts with their behavior
5. Be specific - if they decline "accessories", say that explicitly
6. If they accept same-brand variations, note that pattern

Output ONLY the criteria section, nothing else:

Answer YES if:
- [criteria]

Answer NO if:
- [criteria]`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    const customCriteria = response.content[0].text;

    // Save the custom criteria - this REPLACES the {matching_criteria} section in the prompt
    // Save custom criteria to user record
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        custom_matching_prompt: customCriteria,
        custom_matching_enabled: true 
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('Failed to save prompt:', updateError);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        feedback_count: feedbackData.length,
        accepted_count: accepted.length,
        declined_count: declined.length,
        custom_criteria: customCriteria,
        message: 'Custom prompt generated and saved!'
      })
    };

  } catch (error) {
    console.error('Generate prompt error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
