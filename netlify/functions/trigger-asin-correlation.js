const fetch = require('node-fetch');
const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// n8n webhook URL from environment
const N8N_WEBHOOK_URL = process.env.N8N_ASIN_CORRELATION_WEBHOOK_URL;

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    console.log('🔍 trigger-asin-correlation called');

    // 1. Authenticate user
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader) {
      console.log('❌ No auth header');
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.log('❌ Auth error:', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse and validate ASIN
    const { asin } = JSON.parse(event.body);
    console.log(`📦 Requested ASIN: ${asin}`);

    if (!asin) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'ASIN is required' })
      };
    }

    // Validate ASIN format (B followed by 9 alphanumeric characters)
    if (!/^B[0-9A-Z]{9}$/i.test(asin)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid ASIN format. Must be B followed by 9 alphanumeric characters.'
        })
      };
    }

    // 3. Check n8n webhook URL is configured
    if (!N8N_WEBHOOK_URL) {
      console.error('❌ N8N_ASIN_CORRELATION_WEBHOOK_URL not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Workflow service not configured. Please contact administrator.'
        })
      };
    }

    // 4. Call n8n webhook
    console.log(`🚀 Calling n8n webhook for ASIN: ${asin.toUpperCase()}`);

    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        asin: asin.toUpperCase(),
        userId: user.id,
        userEmail: user.email,
        timestamp: new Date().toISOString()
      })
    });

    // 5. Handle n8n response
    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('❌ n8n webhook error:', n8nResponse.status, errorText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: 'Workflow service unavailable',
          details: `Status: ${n8nResponse.status}`
        })
      };
    }

    const correlationData = await n8nResponse.json();
    console.log(`✅ n8n response received:`, {
      hasData: !!correlationData,
      isArray: Array.isArray(correlationData),
      count: Array.isArray(correlationData) ? correlationData.length : 'N/A'
    });

    // 6. Return results
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        asin: asin.toUpperCase(),
        correlations: correlationData
      })
    };

  } catch (error) {
    console.error('❌ ASIN correlation error:', error);
    console.error('Error stack:', error.stack);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to fetch correlation data',
        message: error.message
      })
    };
  }
};
