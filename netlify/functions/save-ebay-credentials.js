// Supabase configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Helper function to make Supabase API calls
async function supabaseRequest(endpoint, method = 'GET', body = null, headers = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const options = {
    method,
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status} - ${text}`);
  }

  return text ? JSON.parse(text) : null;
}

// Helper function to get authenticated user
async function getAuthUser(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${token}`
    }
  });

  if (!response.ok) {
    return null;
  }

  return await response.json();
}

exports.handler = async (event, context) => {
  console.log('Save eBay credentials handler called');
  console.log('Method:', event.httpMethod);

  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Check for authenticated user
    // Netlify lowercases headers, so check both
    const authHeader = event.headers.authorization || event.headers.Authorization;
    const authUser = await getAuthUser(authHeader);
    if (!authUser) {
      console.log('Authentication failed - no valid user found');
      console.log('Headers received:', Object.keys(event.headers));
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Parse request body
    const { app_id, cert_id, dev_id } = JSON.parse(event.body);

    // Validate required fields
    if (!app_id || !cert_id) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'App ID and Cert ID are required' })
      };
    }

    console.log(`Updating credentials for user ${authUser.id}`);

    // Update user record with eBay credentials
    const updatedUser = await supabaseRequest(
      `users?id=eq.${authUser.id}`,
      'PATCH',
      {
        ebay_app_id: app_id,
        ebay_cert_id: cert_id,
        ebay_dev_id: dev_id || null
      }
    );

    console.log('Credentials updated successfully');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'eBay credentials saved successfully'
      })
    };
  } catch (error) {
    console.error('Error saving eBay credentials:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};