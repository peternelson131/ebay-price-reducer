/**
 * Scheduled Price Reduction
 * 
 * F-BG001: Automated price reduction job
 * Runs every 4 hours via Netlify scheduled functions
 * 
 * This is a thin wrapper that calls the existing process-price-reductions
 * function with scheduled=true to process all users.
 */

const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

// Lazy init to avoid issues at module load time
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
  const startTime = Date.now();
  console.log('⏰ Scheduled price reduction triggered at', new Date().toISOString());
  
  try {
    // Call the existing process-price-reductions function internally
    // by importing and invoking it directly
    const processModule = require('./process-price-reductions');
    
    // Create a mock event that triggers scheduled mode
    // F-BG001: Use internal scheduled flag for trusted internal calls
    const mockEvent = {
      httpMethod: 'POST',
      headers: {},
      body: JSON.stringify({
        internalScheduled: 'netlify-scheduled-function'
      })
    };
    
    // Call the handler
    const result = await processModule.handler(mockEvent, context);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Scheduled price reduction completed in ${duration}s`);
    
    // Log to system for monitoring
    try {
      const db = getSupabase();
      await db.from('system_logs').insert({
        event_type: 'scheduled_price_reduction',
        status: result.statusCode === 200 ? 'success' : 'error',
        details: JSON.parse(result.body),
        duration_ms: Date.now() - startTime,
        created_at: new Date().toISOString()
      });
    } catch (logError) {
      console.warn('Could not log to system_logs:', logError.message);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Scheduled price reduction failed:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
