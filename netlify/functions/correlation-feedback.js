/**
 * ASIN Correlation Feedback API
 * Save user accept/decline decisions on the existing asin_correlations table
 */

const { createClient } = require('@supabase/supabase-js');

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
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
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Missing authorization' })
      };
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const { action } = body;

    // Use service role for database operations
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // GET feedback history
    if (event.httpMethod === 'GET' || action === 'get') {
      const { search_asin } = body;
      
      let query = supabaseAdmin
        .from('asin_correlations')
        .select('search_asin, similar_asin, correlated_title, decision, decline_reason, decision_at')
        .eq('user_id', user.id)
        .not('decision', 'is', null)
        .order('decision_at', { ascending: false });
      
      if (search_asin) {
        query = query.eq('search_asin', search_asin.toUpperCase());
      }
      
      const { data, error } = await query.limit(100);
      
      if (error) throw error;
      
      // Map to expected format
      const feedback = (data || []).map(row => ({
        search_asin: row.search_asin,
        candidate_asin: row.similar_asin,
        candidate_title: row.correlated_title,
        decision: row.decision,
        decline_reason: row.decline_reason,
        created_at: row.decision_at
      }));
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, feedback })
      };
    }

    // SAVE feedback - update existing correlation record
    if (action === 'save') {
      const { search_asin, candidate_asin, decision, decline_reason } = body;
      
      if (!search_asin || !candidate_asin || !decision) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'search_asin, candidate_asin, and decision required' })
        };
      }
      
      if (!['accepted', 'declined'].includes(decision)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'decision must be "accepted" or "declined"' })
        };
      }

      // Update the existing correlation record with the decision
      const { data, error } = await supabaseAdmin
        .from('asin_correlations')
        .update({
          decision,
          decline_reason: decision === 'declined' ? decline_reason : null,
          decision_at: new Date().toISOString()
        })
        .eq('user_id', user.id)
        .eq('search_asin', search_asin.toUpperCase())
        .eq('similar_asin', candidate_asin.toUpperCase())
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Correlation not found' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, saved: data })
      };
    }

    // GET stats for learning
    if (action === 'stats') {
      const { data, error } = await supabaseAdmin
        .from('asin_correlations')
        .select('decision, decline_reason')
        .eq('user_id', user.id)
        .not('decision', 'is', null);

      if (error) throw error;

      const stats = {
        total: data.length,
        accepted: data.filter(d => d.decision === 'accepted').length,
        declined: data.filter(d => d.decision === 'declined').length,
        decline_reasons: {}
      };

      data.filter(d => d.decline_reason).forEach(d => {
        stats.decline_reasons[d.decline_reason] = (stats.decline_reasons[d.decline_reason] || 0) + 1;
      });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, stats })
      };
    }

    // UNDO feedback - clear decision from correlation record
    if (action === 'undo') {
      const { search_asin, candidate_asin } = body;
      
      if (!search_asin || !candidate_asin) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'search_asin and candidate_asin required' })
        };
      }

      // Clear the decision fields
      const { data, error } = await supabaseAdmin
        .from('asin_correlations')
        .update({
          decision: null,
          decline_reason: null,
          decision_at: null
        })
        .eq('user_id', user.id)
        .eq('search_asin', search_asin.toUpperCase())
        .eq('similar_asin', candidate_asin.toUpperCase())
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Correlation not found' })
        };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, undone: data })
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action. Use: save, get, stats, or undo' })
    };

  } catch (error) {
    console.error('Feedback error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
