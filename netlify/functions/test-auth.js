/**
 * Test Supabase auth token validation
 */

const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get auth header
    const authHeader = event.headers.authorization || event.headers.Authorization;
    
    if (!authHeader) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          step: 'no auth header',
          headers: Object.keys(event.headers)
        })
      };
    }
    
    const token = authHeader.substring(7);
    
    console.log('Validating token...');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          step: 'auth error',
          error: authError.message,
          tokenLength: token.length
        })
      };
    }
    
    if (!user) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          step: 'no user',
          tokenLength: token.length
        })
      };
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        userId: user.id.substring(0, 8) + '...',
        email: user.email?.substring(0, 10) + '...'
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
