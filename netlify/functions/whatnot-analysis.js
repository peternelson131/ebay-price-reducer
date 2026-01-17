/**
 * WhatNot Manifest Analysis Function
 * 
 * Handles import, listing, enrichment, and deletion of WhatNot liquidation manifests.
 * Actions:
 *   - import: Parse CSV and insert rows
 *   - list: Get analyses with pagination
 *   - enrich: Call Keepa API to fill product data
 *   - delete: Remove analysis entries
 *   - clear: Clear all entries for a lot or all
 */

const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const https = require('https');

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Encryption for API keys
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const IV_LENGTH = 16;

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
    console.error('Decryption error:', error);
    return null;
  }
}

// HTTPS helper for Keepa
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
          reject(new Error(`Invalid JSON from Keepa: ${e.message}`));
        }
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

// Get user from token
async function getUserFromToken(token) {
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// Get user's Keepa API key
async function getKeepaApiKey(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('keepa_api_key')
    .eq('id', userId)
    .single();
  
  if (error || !data?.keepa_api_key) return null;
  return decryptApiKey(data.keepa_api_key);
}

// Parse Keepa price (stored as integer cents * 100, or -1 for unavailable)
function parseKeepaPrice(priceArray) {
  if (!priceArray || priceArray.length === 0) return null;
  // Get most recent price (last non-negative value)
  for (let i = priceArray.length - 1; i >= 0; i -= 2) {
    const price = priceArray[i];
    if (price > 0) return price / 100;
  }
  return null;
}

// Parse Keepa sales rank
function parseKeepaRank(rankArray) {
  if (!rankArray || rankArray.length === 0) return null;
  // Get most recent rank (last non-negative value)
  for (let i = rankArray.length - 1; i >= 0; i -= 2) {
    const rank = rankArray[i];
    if (rank > 0) return rank;
  }
  return null;
}

// Calculate 90-day average sales rank
function calculateAvgRank90(rankArray) {
  if (!rankArray || rankArray.length < 2) return null;
  
  const now = Math.floor(Date.now() / 60000) - 21564000; // Keepa epoch offset
  const ninety_days_ago = now - (90 * 24 * 60);
  
  let sum = 0;
  let count = 0;
  
  for (let i = 0; i < rankArray.length - 1; i += 2) {
    const time = rankArray[i];
    const rank = rankArray[i + 1];
    if (time >= ninety_days_ago && rank > 0) {
      sum += rank;
      count++;
    }
  }
  
  return count > 0 ? Math.round(sum / count) : null;
}

// CORS headers
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
};

exports.handler = async (event, context) => {
  // Handle OPTIONS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Authenticate
    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Unauthorized' })
      };
    }

    const user = await getUserFromToken(authHeader.substring(7));
    if (!user) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ success: false, error: 'Invalid token' })
      };
    }

    // Handle GET requests (list)
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {};
      const action = params.action || 'list';

      if (action === 'list') {
        const page = parseInt(params.page) || 1;
        const limit = Math.min(parseInt(params.limit) || 50, 100);
        const offset = (page - 1) * limit;
        const sortBy = params.sortBy || 'created_at';
        const sortOrder = params.sortOrder === 'asc' ? true : false;
        const lotId = params.lotId;
        const status = params.status;

        let query = supabase
          .from('whatnot_analyses')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id);

        if (lotId) query = query.eq('lot_id', lotId);
        if (status && status !== 'all') query = query.eq('status', status);

        // Apply sorting
        const validSortColumns = ['created_at', 'roi_percent', 'estimated_profit', 'sales_rank', 'amazon_price', 'title', 'asin'];
        const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
        query = query.order(sortColumn, { ascending: sortOrder, nullsFirst: false });

        query = query.range(offset, offset + limit - 1);

        const { data: items, error, count } = await query;

        if (error) {
          console.error('List error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            items: items || [],
            pagination: {
              page,
              limit,
              total: count || 0,
              pages: Math.ceil((count || 0) / limit)
            }
          })
        };
      }

      if (action === 'lots') {
        // Get unique lot IDs
        const { data, error } = await supabase
          .from('whatnot_analyses')
          .select('lot_id')
          .eq('user_id', user.id)
          .not('lot_id', 'is', null);

        if (error) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        const uniqueLots = [...new Set(data.map(d => d.lot_id))].filter(Boolean);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, lots: uniqueLots })
        };
      }

      if (action === 'stats') {
        // Get summary stats
        const { data, error } = await supabase
          .from('whatnot_analyses')
          .select('status, roi_percent, estimated_profit, quantity')
          .eq('user_id', user.id);

        if (error) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        const stats = {
          total: data.length,
          imported: data.filter(d => d.status === 'imported').length,
          enriched: data.filter(d => d.status === 'enriched').length,
          errors: data.filter(d => d.status === 'error').length,
          avgRoi: 0,
          totalProfit: 0,
          totalQty: 0
        };

        const enrichedItems = data.filter(d => d.roi_percent != null);
        if (enrichedItems.length > 0) {
          stats.avgRoi = enrichedItems.reduce((sum, d) => sum + (d.roi_percent || 0), 0) / enrichedItems.length;
          stats.totalProfit = data.reduce((sum, d) => sum + ((d.estimated_profit || 0) * (d.quantity || 1)), 0);
        }
        stats.totalQty = data.reduce((sum, d) => sum + (d.quantity || 1), 0);

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, stats })
        };
      }
    }

    // Handle POST requests
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { action } = body;

      // ===== IMPORT ACTION =====
      if (action === 'import') {
        const { items, lotId } = body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'No items to import' })
          };
        }

        // Prepare rows for insert
        const rows = items.map(item => ({
          user_id: user.id,
          asin: item.asin?.toUpperCase(),
          title: item.title || item.description,
          quantity: parseInt(item.quantity) || 1,
          manifest_price: parseFloat(item.unitRetail) || null,
          ext_retail: parseFloat(item.extRetail) || null,
          brand: item.brand,
          upc: item.upc,
          condition: item.condition,
          lot_id: item.lotId || lotId,
          status: 'imported'
        })).filter(r => r.asin && /^B[0-9A-Z]{9}$/.test(r.asin));

        if (rows.length === 0) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'No valid ASINs found in import data' })
          };
        }

        // Upsert with conflict handling
        const { data, error } = await supabase
          .from('whatnot_analyses')
          .upsert(rows, {
            onConflict: 'user_id,asin,lot_id',
            ignoreDuplicates: false
          })
          .select();

        if (error) {
          console.error('Import error:', error);
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            imported: data?.length || rows.length,
            message: `Imported ${data?.length || rows.length} items`
          })
        };
      }

      // ===== ENRICH ACTION =====
      if (action === 'enrich') {
        const { ids, limit: enrichLimit } = body;
        const batchSize = Math.min(enrichLimit || 10, 100);

        // Get Keepa API key
        const apiKey = await getKeepaApiKey(user.id);
        if (!apiKey) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Keepa API key not configured' })
          };
        }

        // Get items to enrich
        let query = supabase
          .from('whatnot_analyses')
          .select('id, asin')
          .eq('user_id', user.id)
          .in('status', ['imported', 'error']);

        if (ids && ids.length > 0) {
          query = query.in('id', ids);
        }

        query = query.limit(batchSize);

        const { data: items, error: fetchError } = await query;

        if (fetchError || !items || items.length === 0) {
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              enriched: 0,
              message: 'No items to enrich'
            })
          };
        }

        // Mark as enriching
        const itemIds = items.map(i => i.id);
        await supabase
          .from('whatnot_analyses')
          .update({ status: 'enriching' })
          .in('id', itemIds);

        // Batch ASINs for Keepa (up to 100 per request)
        const asins = [...new Set(items.map(i => i.asin))];
        const asinString = asins.join(',');

        try {
          // Call Keepa API
          const keepaUrl = `https://api.keepa.com/product?key=${apiKey}&domain=1&asin=${asinString}&stats=180&offers=20`;
          const keepaData = await httpsGet(keepaUrl);

          if (!keepaData.products) {
            throw new Error('No products returned from Keepa');
          }

          // Build update map
          const productMap = {};
          for (const product of keepaData.products) {
            const csv = product.csv || [];
            const stats = product.stats || {};

            // Parse pricing data
            const amazonPrice = parseKeepaPrice(csv[0]); // Amazon price
            const buyBoxPrice = parseKeepaPrice(csv[18]); // Buy Box price
            const salesRank = parseKeepaRank(csv[3]); // Sales rank
            const salesRank90Avg = stats.avg90 ? stats.avg90[3] : calculateAvgRank90(csv[3]);

            // Count sellers from offers
            let fbaCount = 0;
            let fbmCount = 0;
            if (product.offers) {
              for (const offer of product.offers) {
                if (offer.isFBA) fbaCount++;
                else fbmCount++;
              }
            }

            // Get image URL
            let imageUrl = null;
            if (product.imagesCSV) {
              const images = product.imagesCSV.split(',');
              if (images[0]) {
                imageUrl = `https://images-na.ssl-images-amazon.com/images/I/${images[0]}`;
              }
            }

            // Get category
            let category = null;
            if (product.categoryTree && product.categoryTree.length > 0) {
              category = product.categoryTree.map(c => c.name).join(' > ');
            }

            productMap[product.asin] = {
              amazon_price: amazonPrice || buyBoxPrice,
              buy_box_price: buyBoxPrice,
              sales_rank: salesRank,
              sales_rank_90_avg: salesRank90Avg,
              fba_sellers: fbaCount,
              fbm_sellers: fbmCount,
              image_url: imageUrl,
              category: category,
              title: product.title || null,
              status: 'enriched'
            };
          }

          // Update each item
          let enrichedCount = 0;
          for (const item of items) {
            const enrichment = productMap[item.asin];
            if (enrichment) {
              // Calculate profit and ROI if we have price data
              const manifestPrice = await supabase
                .from('whatnot_analyses')
                .select('manifest_price, quantity')
                .eq('id', item.id)
                .single();

              const mp = manifestPrice.data?.manifest_price;
              const qty = manifestPrice.data?.quantity || 1;

              if (mp && enrichment.amazon_price) {
                // Estimate profit: (Amazon price * 0.85 - manifest price) * quantity
                // 0.85 accounts for ~15% fees
                const profitPerUnit = (enrichment.amazon_price * 0.85) - mp;
                enrichment.estimated_profit = parseFloat((profitPerUnit * qty).toFixed(2));
                enrichment.roi_percent = mp > 0 ? parseFloat(((profitPerUnit / mp) * 100).toFixed(2)) : null;
              }

              await supabase
                .from('whatnot_analyses')
                .update(enrichment)
                .eq('id', item.id);
              enrichedCount++;
            } else {
              // No data found
              await supabase
                .from('whatnot_analyses')
                .update({
                  status: 'error',
                  error_message: 'Product not found in Keepa'
                })
                .eq('id', item.id);
            }
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              enriched: enrichedCount,
              tokensUsed: keepaData.tokensConsumed || asins.length,
              message: `Enriched ${enrichedCount} of ${items.length} items`
            })
          };
        } catch (keepaError) {
          console.error('Keepa error:', keepaError);

          // Mark items as error
          await supabase
            .from('whatnot_analyses')
            .update({
              status: 'error',
              error_message: keepaError.message
            })
            .in('id', itemIds);

          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
              success: false,
              error: `Keepa API error: ${keepaError.message}`
            })
          };
        }
      }

      // ===== DELETE ACTION =====
      if (action === 'delete') {
        const { ids, lotId } = body;

        if (ids && ids.length > 0) {
          const { error } = await supabase
            .from('whatnot_analyses')
            .delete()
            .eq('user_id', user.id)
            .in('id', ids);

          if (error) {
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ success: false, error: error.message })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, deleted: ids.length })
          };
        }

        if (lotId) {
          const { data, error } = await supabase
            .from('whatnot_analyses')
            .delete()
            .eq('user_id', user.id)
            .eq('lot_id', lotId)
            .select('id');

          if (error) {
            return {
              statusCode: 500,
              headers,
              body: JSON.stringify({ success: false, error: error.message })
            };
          }

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, deleted: data?.length || 0 })
          };
        }

        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Specify ids or lotId to delete' })
        };
      }

      // ===== CLEAR ALL ACTION =====
      if (action === 'clear') {
        const { confirm } = body;
        if (confirm !== 'DELETE_ALL') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ success: false, error: 'Must confirm with DELETE_ALL' })
          };
        }

        const { data, error } = await supabase
          .from('whatnot_analyses')
          .delete()
          .eq('user_id', user.id)
          .select('id');

        if (error) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, deleted: data?.length || 0 })
        };
      }

      // ===== EXPORT ACTION =====
      if (action === 'export') {
        const { data, error } = await supabase
          .from('whatnot_analyses')
          .select('*')
          .eq('user_id', user.id)
          .order('roi_percent', { ascending: false, nullsFirst: false });

        if (error) {
          return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message })
          };
        }

        // Build CSV
        const csvHeaders = [
          'ASIN', 'Title', 'Brand', 'Condition', 'Quantity',
          'Manifest Price', 'Amazon Price', 'Buy Box Price',
          'Sales Rank', '90-Day Avg Rank', 'FBA Sellers', 'FBM Sellers',
          'Estimated Profit', 'ROI %', 'Lot ID', 'Category', 'Status'
        ];

        const csvRows = data.map(item => [
          item.asin,
          `"${(item.title || '').replace(/"/g, '""')}"`,
          `"${(item.brand || '').replace(/"/g, '""')}"`,
          item.condition,
          item.quantity,
          item.manifest_price,
          item.amazon_price,
          item.buy_box_price,
          item.sales_rank,
          item.sales_rank_90_avg,
          item.fba_sellers,
          item.fbm_sellers,
          item.estimated_profit,
          item.roi_percent,
          item.lot_id,
          `"${(item.category || '').replace(/"/g, '""')}"`,
          item.status
        ].join(','));

        const csv = [csvHeaders.join(','), ...csvRows].join('\n');

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ success: true, csv })
        };
      }

      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ success: false, error: `Unknown action: ${action}` })
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, error: 'Method not allowed' })
    };

  } catch (error) {
    console.error('Function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
