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

    const analysisPrompt = `You are analyzing a user's product matching preferences based on their accept/decline history.

STATISTICS:
- Total decisions: ${feedbackData.length}
- Accepted: ${accepted.length}
- Declined: ${declined.length}
- Decline reasons: ${JSON.stringify(declineReasons)}

ACCEPTED MATCHES (user wants these):
${acceptedExamples || 'No examples yet'}

DECLINED MATCHES (user doesn't want these):
${declinedExamples || 'No examples yet'}

Based on this data, write a custom AI prompt criteria that captures this user's specific preferences. The prompt should be used to evaluate if a CANDIDATE product matches a PRIMARY product.

Output ONLY the criteria section (the "Answer YES if" and "Answer NO if" parts), formatted exactly like this example:

Answer YES if:
- [specific criteria based on user's acceptances]
- [another criteria]

Answer NO if:
- [specific criteria based on user's declines]
- [another criteria]

Be specific based on the patterns you see. If they consistently decline accessories, say "accessories". If they accept same-brand different models, note that.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    const customCriteria = response.content[0].text;

    // Save ONLY the custom criteria - the base prompt template is handled separately
    // This gets injected into {custom_criteria} in the default prompt
    const formattedCriteria = `=== YOUR PERSONALIZED CRITERIA ===
(Based on ${feedbackData.length} product decisions)

${customCriteria}`;

    // Save custom criteria to user record (not the full prompt)
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        custom_matching_prompt: formattedCriteria,
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
