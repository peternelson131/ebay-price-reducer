/**
 * Minimal v2 test - step by step to find the bug
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

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

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  const steps = [];
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'POST only' }) };
  }
  
  try {
    // Step 1: Parse body
    steps.push('parsing body');
    const body = JSON.parse(event.body || '{}');
    const { asin = 'B0DMVWYDXR', action = 'check' } = body;
    steps.push(`asin: ${asin}, action: ${action}`);
    
    // Step 2: Auth
    steps.push('checking auth');
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      return { statusCode: 200, headers, body: JSON.stringify({ steps, error: 'No auth header' }) };
    }
    
    steps.push('validating token');
    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);
    
    if (authError || !user) {
      return { statusCode: 200, headers, body: JSON.stringify({ steps, error: authError?.message || 'No user' }) };
    }
    steps.push(`user: ${user.id.substring(0, 8)}`);
    
    // Step 3: Check action
    if (action === 'check') {
      steps.push('checking DB for correlations');
      const { data: correlations, error: dbError } = await getSupabase()
        .from('asin_correlations')
        .select('similar_asin, correlated_title')
        .eq('search_asin', asin.toUpperCase())
        .limit(5);
      
      if (dbError) {
        return { statusCode: 200, headers, body: JSON.stringify({ steps, error: dbError.message }) };
      }
      
      steps.push(`found ${correlations?.length || 0} correlations`);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          steps,
          exists: (correlations?.length || 0) > 0,
          count: correlations?.length || 0
        })
      };
    }
    
    // Step 4: Sync action
    if (action === 'sync') {
      steps.push('getting keepa key from user');
      const { data: keyData } = await getSupabase()
        .from('user_api_keys')
        .select('api_key_encrypted')
        .eq('user_id', user.id)
        .eq('service', 'keepa')
        .single();
      
      let keepaKey = keyData?.api_key_encrypted || process.env.KEEPA_API_KEY;
      steps.push(`keepa key: ${keepaKey ? 'found' : 'missing'}`);
      
      if (!keepaKey) {
        return { statusCode: 200, headers, body: JSON.stringify({ steps, error: 'No Keepa key' }) };
      }
      
      // Step 5: Call Keepa
      steps.push('calling keepa');
      const url = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${asin}`;
      const response = await axios.get(url, { decompress: true, timeout: 8000 });
      
      const product = response.data.products?.[0];
      if (!product) {
        return { statusCode: 200, headers, body: JSON.stringify({ steps, error: 'Product not found' }) };
      }
      
      steps.push(`product: ${product.title?.substring(0, 30)}`);
      steps.push(`variations: ${product.variations?.length || 0}`);
      
      // Step 6: Get variations
      const variationAsins = (product.variations || []).map(v => v.asin).filter(a => a !== asin).slice(0, 5);
      
      if (variationAsins.length === 0) {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, steps, message: 'No variations to save' })
        };
      }
      
      steps.push(`fetching ${variationAsins.length} variations`);
      const varUrl = `https://api.keepa.com/product?key=${keepaKey}&domain=1&asin=${variationAsins.join(',')}`;
      const varResponse = await axios.get(varUrl, { decompress: true, timeout: 8000 });
      
      const variations = (varResponse.data.products || []).map(p => ({
        user_id: user.id,
        search_asin: asin.toUpperCase(),
        similar_asin: p.asin,
        correlated_title: p.title || 'Unknown',
        suggested_type: 'variation',
        source: 'test-v2-minimal'
      }));
      
      steps.push(`saving ${variations.length} variations`);
      
      // Step 7: Write to DB
      const { error: writeError } = await getSupabase()
        .from('asin_correlations')
        .upsert(variations, { onConflict: 'search_asin,similar_asin' });
      
      if (writeError) {
        return { statusCode: 200, headers, body: JSON.stringify({ steps, error: writeError.message }) };
      }
      
      steps.push('done!');
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, steps, saved: variations.length })
      };
    }
    
    return { statusCode: 200, headers, body: JSON.stringify({ steps, error: 'Unknown action' }) };
    
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        steps,
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3)
      })
    };
  }
};
