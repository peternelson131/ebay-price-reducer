const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const https = require('https');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';

// Keepa domain IDs
const DOMAINS = {
  US: 1,
  UK: 2,
  DE: 3,
  CA: 6
};

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

function decryptApiKey(storedKey) {
  if (!storedKey) return null;
  
  // Check if it looks like an encrypted key (contains colon separator)
  if (storedKey.includes(':') && ENCRYPTION_KEY) {
    try {
      const parts = storedKey.split(':');
      const iv = Buffer.from(parts.shift(), 'hex');
      const encrypted = Buffer.from(parts.join(':'), 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    } catch (error) {
      console.log('Decryption failed, trying as plain text');
    }
  }
  
  // Return as-is if not encrypted or decryption failed
  return storedKey;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = new URL(url);
    options.headers = {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'User-Agent': 'eBay-Price-Reducer/1.0'
    };

    https.get(options, (res) => {
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => { errorData += chunk; });
        res.on('end', () => {
          reject(new Error(`Keepa API returned status ${res.statusCode}: ${errorData}`));
        });
        return;
      }

      let stream = res;
      const encoding = res.headers['content-encoding'];

      if (encoding === 'gzip') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === 'deflate') {
        const zlib = require('zlib');
        stream = res.pipe(zlib.createInflate());
      }

      let data = '';
      stream.on('data', (chunk) => { data += chunk; });
      stream.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Invalid JSON: ${e.message}`));
        }
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

// Check ASIN availability across all marketplaces
async function checkMarketplaceAvailability(apiKey, asin) {
  const availability = {};
  
  for (const [market, domainId] of Object.entries(DOMAINS)) {
    try {
      const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domainId}&asin=${asin}`;
      const data = await httpsGet(url);
      
      if (data.products && data.products.length > 0) {
        const product = data.products[0];
        availability[market] = !!(product.title && product.title.length > 0);
      } else {
        availability[market] = false;
      }
    } catch (error) {
      console.error(`Error checking ${asin} on ${market}:`, error.message);
      availability[market] = null; // null = unknown/error
    }
  }
  
  return availability;
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
        .select('similar_asin, decision, uploaded_usa, uploaded_ca, uploaded_de, uploaded_uk, available_us, available_ca, available_de, available_uk')
        .eq('search_asin', search_asin.toUpperCase())
        .eq('user_id', user.id);

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

      if (action === 'mark_uploaded') {
        const body = JSON.parse(event.body);
        const marketplace = body.marketplace || 'usa';
        
        const updateData = {};
        const marketplaceLower = marketplace.toLowerCase();
        
        if (marketplaceLower === 'usa' || marketplaceLower === 'us') {
          updateData.uploaded_usa = true;
          updateData.uploaded_usa_at = new Date().toISOString();
        } else if (marketplaceLower === 'ca') {
          updateData.uploaded_ca = true;
          updateData.uploaded_ca_at = new Date().toISOString();
        } else if (marketplaceLower === 'de') {
          updateData.uploaded_de = true;
          updateData.uploaded_de_at = new Date().toISOString();
        } else if (marketplaceLower === 'uk') {
          updateData.uploaded_uk = true;
          updateData.uploaded_uk_at = new Date().toISOString();
        }

        const { error } = await supabase
          .from('asin_correlations')
          .update(updateData)
          .eq('search_asin', normalizedSearch)
          .eq('similar_asin', normalizedCandidate)
          .eq('user_id', user.id);

        if (error) throw error;

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, message: `Marked as uploaded to ${marketplace}` })
        };
      }

      // Save decision
      if (!decision || !['accepted', 'declined'].includes(decision)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid decision required (accepted/declined)' }) };
      }

      // If accepting, check marketplace availability via Keepa
      let availability = null;
      if (decision === 'accepted') {
        // Get user's Keepa API key
        const { data: userProfile } = await supabase
          .from('users')
          .select('keepa_api_key')
          .eq('id', user.id)
          .single();

        if (userProfile?.keepa_api_key) {
          const apiKey = decryptApiKey(userProfile.keepa_api_key);
          if (apiKey) {
            console.log(`Checking marketplace availability for ${normalizedCandidate}...`);
            availability = await checkMarketplaceAvailability(apiKey, normalizedCandidate);
            console.log('Availability result:', availability);
          }
        }
      }

      // Build update object
      const updateData = {
        decision,
        decision_at: new Date().toISOString()
      };

      // Add availability data if we checked
      if (availability) {
        updateData.available_us = availability.US;
        updateData.available_ca = availability.CA;
        updateData.available_de = availability.DE;
        updateData.available_uk = availability.UK;
        updateData.availability_checked_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('asin_correlations')
        .update(updateData)
        .eq('search_asin', normalizedSearch)
        .eq('similar_asin', normalizedCandidate)
        .eq('user_id', user.id);

      if (error) throw error;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          success: true, 
          message: 'Feedback saved',
          availability: availability
        })
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
