const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const https = require('https');

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const IV_LENGTH = 16;

// Keepa domain IDs
const DOMAINS = {
  US: 1,   // amazon.com
  UK: 2,   // amazon.co.uk
  DE: 3,   // amazon.de
  CA: 6    // amazon.ca
};

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

function decryptApiKey(encryptedKey) {
  if (!ENCRYPTION_KEY || !encryptedKey) return null;
  try {
    const parts = encryptedKey.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encrypted = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    return null;
  }
}

async function getUserFromToken(token) {
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Check if ASIN exists on a specific marketplace
async function checkAsinOnMarketplace(apiKey, asin, domainId) {
  try {
    const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domainId}&asin=${asin}`;
    const data = await httpsGet(url);
    
    if (data.products && data.products.length > 0) {
      const product = data.products[0];
      // Product exists if it has a title and isn't marked as not available
      const exists = product.title && product.title.length > 0;
      return { exists, title: product.title };
    }
    return { exists: false };
  } catch (error) {
    console.error(`Error checking ${asin} on domain ${domainId}:`, error.message);
    return { exists: false, error: error.message };
  }
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'No authentication token' })
      };
    }

    const token = authHeader.substring(7);
    const user = await getUserFromToken(token);
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, message: 'Invalid token' })
      };
    }

    // Get user's Keepa API key
    const { data: userProfile } = await supabase
      .from('users')
      .select('keepa_api_key')
      .eq('id', user.id)
      .single();

    if (!userProfile?.keepa_api_key) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'No Keepa API key configured' })
      };
    }

    const apiKey = decryptApiKey(userProfile.keepa_api_key);
    if (!apiKey) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ success: false, message: 'Failed to decrypt API key' })
      };
    }

    // Parse request
    const body = JSON.parse(event.body || '{}');
    const { asins } = body;

    if (!asins || !Array.isArray(asins) || asins.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, message: 'ASINs array required' })
      };
    }

    // Limit to prevent API abuse
    const limitedAsins = asins.slice(0, 20);
    
    // Check each ASIN across all marketplaces
    // To save API tokens, we'll batch by making one call per domain with multiple ASINs
    const results = {};
    
    for (const domainKey of Object.keys(DOMAINS)) {
      const domainId = DOMAINS[domainKey];
      const asinList = limitedAsins.join(',');
      
      try {
        const url = `https://api.keepa.com/product?key=${apiKey}&domain=${domainId}&asin=${asinList}`;
        const data = await httpsGet(url);
        
        if (data.products) {
          for (const product of data.products) {
            if (!results[product.asin]) {
              results[product.asin] = {};
            }
            // Product is available if it has a title
            results[product.asin][domainKey] = !!(product.title && product.title.length > 0);
          }
        }
        
        // Mark ASINs not returned as unavailable
        for (const asin of limitedAsins) {
          if (!results[asin]) {
            results[asin] = {};
          }
          if (results[asin][domainKey] === undefined) {
            results[asin][domainKey] = false;
          }
        }
      } catch (error) {
        console.error(`Error checking domain ${domainKey}:`, error.message);
        // Mark all as unknown/false on error
        for (const asin of limitedAsins) {
          if (!results[asin]) results[asin] = {};
          results[asin][domainKey] = null; // null indicates error/unknown
        }
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        availability: results
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, message: error.message })
    };
  }
};
