const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function getSupabase() {
  return createClient(supabaseUrl, supabaseServiceKey);
}

function getCorsHeaders(event) {
  const origin = event.headers.origin || event.headers.Origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Auth check
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  try {
    // GET - Retrieve existing feedback
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const { search_asin } = params;

      if (!search_asin) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'search_asin required' }) };
      }

      const { data, error } = await supabase
        .from('asin_correlations')
        .select('similar_asin, decision')
        .eq('search_asin', search_asin.toUpperCase())
        .eq('user_id', user.id)
        .not('decision', 'is', null);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, feedback: data })
      };
    }

    // POST - Save or undo feedback
    if (event.httpMethod === 'POST') {
      const { action, search_asin, candidate_asin, decision } = JSON.parse(event.body);

      if (!search_asin || !candidate_asin) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'search_asin and candidate_asin required' }) };
      }

      const normalizedSearch = search_asin.toUpperCase();
      const normalizedCandidate = candidate_asin.toUpperCase();

      if (action === 'undo') {
        // Clear decision
        const { error } = await supabase
          .from('asin_correlations')
          .update({ decision: null, decision_at: null })
          .eq('search_asin', normalizedSearch)
          .eq('similar_asin', normalizedCandidate)
          .eq('user_id', user.id);

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: 'Decision cleared' })
        };
      }

      // Save decision
      if (!decision || !['accepted', 'declined'].includes(decision)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid decision required (accepted/declined)' }) };
      }

      const { error } = await supabase
        .from('asin_correlations')
        .update({ 
          decision,
          decision_at: new Date().toISOString()
        })
        .eq('search_asin', normalizedSearch)
        .eq('similar_asin', normalizedCandidate)
        .eq('user_id', user.id);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Feedback saved' })
      };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  } catch (err) {
    console.error('Feedback error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
