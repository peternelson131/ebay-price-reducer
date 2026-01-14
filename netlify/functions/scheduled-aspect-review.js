const axios = require('axios');

// Scheduled function - runs every 5 minutes
// Configure in netlify.toml: [functions."scheduled-aspect-review"] schedule = "*/5 * * * *"

exports.handler = async (event, context) => {
  console.log('🔍 Running scheduled aspect keyword review');
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    // Call the Supabase edge function
    const response = await axios.post(
      `${supabaseUrl}/functions/v1/aspect-keyword-review`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 120000 // 2 minute timeout
      }
    );
    
    console.log('✅ Aspect review result:', response.data);
    
    return {
      statusCode: 200,
      body: JSON.stringify(response.data)
    };
    
  } catch (error) {
    console.error('❌ Aspect review error:', error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
