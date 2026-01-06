const fetch = require('node-fetch');
const { getCorsHeaders } = require('./utils/cors');
const { createClient } = require('@supabase/supabase-js');

// Lazy-init Supabase client
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

// n8n webhook URL from environment
const N8N_WEBHOOK_URL = process.env.N8N_ASIN_CORRELATION_WEBHOOK_URL;

// Helper function to query and format correlations from database
async function getCorrelationsFromDB(userId, asin) {
  // Note: user_id filter removed since n8n uses hardcoded user_id
  // All users see the same correlation data
  const { data: correlations, error: dbError } = await getSupabase()
    .from('asin_correlations')
    .select('*')
    .eq('search_asin', asin.toUpperCase())
    .order('created_at', { ascending: false });

  if (dbError) {
    console.error('❌ Database query error:', dbError);
    return { error: dbError, correlations: [] };
  }

  // Transform database records to frontend format
  const formattedCorrelations = (correlations || []).map(row => ({
    asin: row.similar_asin,
    title: row.correlated_title,
    imageUrl: row.image_url,
    searchImageUrl: row.search_image_url,
    correlationScore: row.correlation_score ? parseFloat(row.correlation_score) / 100 : null,
    suggestedType: row.suggested_type,
    source: row.source,
    url: row.correlated_amazon_url
  }));

  return { error: null, correlations: formattedCorrelations };
}

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
    const { data: { user }, error: authError } = await getSupabase().auth.getUser(token);

    if (authError || !user) {
      console.log('❌ Auth error:', authError);
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    console.log(`✅ User authenticated: ${user.id}`);

    // 2. Parse request body
    const { asin, action = 'check' } = JSON.parse(event.body);
    console.log(`📦 Requested ASIN: ${asin}, Action: ${action}`);

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

    const normalizedAsin = asin.toUpperCase();

    // ACTION: CHECK - Just check if ASIN exists in database
    if (action === 'check') {
      console.log(`🔎 Checking database for ASIN: ${normalizedAsin}`);

      const { error, correlations } = await getCorrelationsFromDB(user.id, normalizedAsin);

      if (error) {
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Database query failed' })
        };
      }

      const exists = correlations.length > 0;
      console.log(`📊 ASIN ${normalizedAsin} exists: ${exists}, count: ${correlations.length}`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          asin: normalizedAsin,
          exists: exists,
          correlations: correlations,
          count: correlations.length,
          source: 'database'
        })
      };
    }

    // ACTION: SYNC - Trigger n8n webhook then return data
    if (action === 'sync') {
      console.log(`🔄 Syncing ASIN: ${normalizedAsin}`);

      // Check n8n webhook URL is configured
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

      // Call n8n webhook
      console.log(`🚀 Calling n8n webhook for ASIN: ${normalizedAsin}`);

      const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          asin: normalizedAsin,
          userId: user.id,
          userEmail: user.email,
          timestamp: new Date().toISOString()
        })
      });

      // Handle n8n response
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

      const n8nResult = await n8nResponse.json();
      console.log(`✅ n8n workflow completed:`, {
        hasResult: !!n8nResult,
        resultType: typeof n8nResult
      });

      // Small delay to ensure n8n has finished writing to database
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Query database for results
      const { error, correlations } = await getCorrelationsFromDB(user.id, normalizedAsin);

      if (error) {
        // Fall back to n8n direct response if DB query fails
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            asin: normalizedAsin,
            exists: true,
            correlations: Array.isArray(n8nResult) ? n8nResult : [],
            count: Array.isArray(n8nResult) ? n8nResult.length : 0,
            source: 'n8n_direct'
          })
        };
      }

      console.log(`📊 Found ${correlations.length} correlations after sync`);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          asin: normalizedAsin,
          exists: true,
          correlations: correlations,
          count: correlations.length,
          source: 'database',
          synced: true
        })
      };
    }

    // Invalid action
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action. Use "check" or "sync".' })
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
