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

    const analysisPrompt = `Analyze this user's product matching preferences and create a brief summary of their patterns.

USER'S FEEDBACK DATA:
- Total decisions: ${feedbackData.length}
- Accepted: ${accepted.length}  
- Declined: ${declined.length}
- Decline reasons: ${JSON.stringify(declineReasons)}

ACCEPTED MATCHES (user wants these):
${acceptedExamples || 'None yet'}

DECLINED MATCHES (user rejected these):
${declinedExamples || 'None yet'}

Create a concise summary for the AI to use as additional context. Format it exactly like this:

=== USER PREFERENCES ===
This user tends to ACCEPT:
- [pattern 1 from their accepts]
- [pattern 2]

This user tends to DECLINE:
- [pattern 1 from their declines]  
- [pattern 2]

Sample accepted: [1-2 brief examples]
Sample declined: [1-2 brief examples]

Keep it brief - this is context to help the AI make better decisions, not a complete rule rewrite.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 500,
      messages: [{ role: 'user', content: analysisPrompt }]
    });

    const userExamples = response.content[0].text;

    // Save the user examples summary - this gets injected as {user_examples} in the prompt
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ 
        custom_matching_prompt: userExamples,
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
