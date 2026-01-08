/**
 * Test Supabase connection and auth
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          error: 'Missing env vars',
          hasUrl: !!supabaseUrl,
          hasKey: !!supabaseKey,
          envKeys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
        })
      };
    }
    
    console.log('Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('Testing database query...');
    const { data, error } = await supabase
      .from('asin_correlations')
      .select('search_asin')
      .limit(1);
    
    if (error) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ dbError: error.message, details: error })
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        supabaseUrl: supabaseUrl.substring(0, 30) + '...',
        testQuery: data?.length || 0
      })
    };
  } catch (error) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 5)
      })
    };
  }
};
