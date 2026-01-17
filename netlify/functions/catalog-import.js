/**
 * Catalog Import - Import Amazon Influencer catalog for correlation analysis
 * 
 * POST /catalog-import - Upload Excel/CSV file with ASINs
 * GET /catalog-import - List imported catalog items with status and correlations
 * DELETE /catalog-import - Clear user's catalog imports (optional: by status)
 * 
 * Expected Excel/CSV columns: ASIN, Product Title, Main Image, Category, Price
 * Column matching is case-insensitive and fuzzy (handles variations)
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const Busboy = require('busboy');
const XLSX = require('xlsx');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzipAsync = promisify(zlib.gunzip);

/**
 * Fetch from Keepa API with gzip decompression
 * Keepa returns gzip-compressed JSON, so we need to decompress it first
 */
async function keepaFetch(url) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  
  try {
    // Try to decompress gzip first (most Keepa responses)
    const decompressed = await gunzipAsync(Buffer.from(buffer));
    return JSON.parse(decompressed.toString());
  } catch (err) {
    // Fallback: maybe it wasn't compressed
    try {
      return JSON.parse(Buffer.from(buffer).toString());
    } catch (parseErr) {
      console.error('Failed to parse Keepa response:', parseErr);
      throw new Error('Invalid Keepa API response');
    }
  }
}

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

// ==================== INLINE PROCESSING (for sync action) ====================

/**
 * Get image URL from Keepa product
 */
function getImageUrl(product) {
  if (!product?.imagesCSV) return '';
  const imageCode = product.imagesCSV.split(',')[0]?.trim();
  return imageCode ? `https://m.media-amazon.com/images/I/${imageCode}._SL500_.jpg` : '';
}

/**
 * Extract correlations from Keepa product data
 */
function extractCorrelations(product, searchAsin) {
  const correlations = [];
  const seen = new Set([searchAsin.toUpperCase()]);
  
  // Variation ASINs
  if (product.variations?.length > 0) {
    for (const variation of product.variations) {
      const varAsin = variation.asin;
      if (varAsin && !seen.has(varAsin)) {
        seen.add(varAsin);
        correlations.push({
          asin: varAsin,
          title: variation.title || product.title,
          type: 'variation',
          amazonUrl: `https://www.amazon.com/dp/${varAsin}`
        });
      }
    }
  }
  
  // Frequently Bought Together
  if (product.frequentlyBoughtTogether?.length > 0) {
    for (const fbtAsin of product.frequentlyBoughtTogether) {
      if (fbtAsin && !seen.has(fbtAsin)) {
        seen.add(fbtAsin);
        correlations.push({
          asin: fbtAsin,
          type: 'frequently_bought_together',
          amazonUrl: `https://www.amazon.com/dp/${fbtAsin}`
        });
      }
    }
  }
  
  // Parent ASIN
  if (product.parentAsin && !seen.has(product.parentAsin)) {
    seen.add(product.parentAsin);
    correlations.push({
      asin: product.parentAsin,
      type: 'parent',
      amazonUrl: `https://www.amazon.com/dp/${product.parentAsin}`
    });
  }
  
  return correlations;
}

/**
 * Process a single catalog import item using the REAL asin-correlation Supabase function
 */
async function processImportItem(item, userId) {
  console.log(`🔄 Processing ASIN: ${item.asin} via Supabase edge function`);
  
  try {
    // Mark as processing
    await getSupabase()
      .from('catalog_imports')
      .update({ status: 'processing' })
      .eq('id', item.id);
    
    // Call the REAL asin-correlation Supabase edge function
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    const correlationUrl = `${supabaseUrl}/functions/v1/asin-correlation`;
    console.log(`📡 Calling: ${correlationUrl}`);
    
    const response = await fetch(correlationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`
      },
      body: JSON.stringify({
        asin: item.asin,
        userId: userId,
        action: 'sync'
      })
    });
    
    const result = await response.json();
    
    if (!response.ok || result.error) {
      throw new Error(result.error || result.message || `HTTP ${response.status}`);
    }
    
    console.log(`✅ Edge function returned: ${result.count} correlations (${result.stats?.variations || 0} variations, ${result.stats?.similar || 0} similar)`);
    
    // Update catalog_imports with result
    await getSupabase()
      .from('catalog_imports')
      .update({
        status: 'processed',
        correlation_count: result.count || 0,
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    console.log(`✅ Processed ${item.asin}: ${result.count} correlations`);
    return { asin: item.asin, correlations: result.count || 0 };
    
  } catch (error) {
    console.error(`❌ Error processing ${item.asin}:`, error.message);
    
    await getSupabase()
      .from('catalog_imports')
      .update({
        status: 'error',
        error_message: error.message,
        processed_at: new Date().toISOString()
      })
      .eq('id', item.id);
    
    return { asin: item.asin, error: error.message };
  }
}

/**
 * Process pending items for a user (called inline during sync)
 * Calls the REAL asin-correlation Supabase edge function for each item
 */
async function processUserPendingItems(userId, limit = 10) {
  // Check required env vars
  if (!process.env.SUPABASE_URL) {
    console.error('⚠️ No SUPABASE_URL configured');
    return { processed: 0, errors: 0, remaining: 0 };
  }
  
  // Fetch pending items for this user
  const { data: pendingItems, error: fetchError } = await getSupabase()
    .from('catalog_imports')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);
  
  if (fetchError || !pendingItems || pendingItems.length === 0) {
    console.log('📭 No pending items to process');
    return { processed: 0, errors: 0, remaining: 0 };
  }
  
  console.log(`📋 Processing ${pendingItems.length} pending items via asin-correlation edge function`);
  
  const results = [];
  for (const item of pendingItems) {
    const result = await processImportItem(item, userId);
    results.push(result);
    // Delay between items to avoid rate limits (edge function calls Keepa + Claude)
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  const processed = results.filter(r => !r.error).length;
  const errors = results.filter(r => r.error).length;
  
  // Check remaining
  const { count: remainingCount } = await getSupabase()
    .from('catalog_imports')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  
  console.log(`✅ Inline processing complete: ${processed} processed, ${errors} errors, ${remainingCount || 0} remaining`);
  
  return { processed, errors, remaining: remainingCount || 0 };
}

// Column name mappings - handles various naming conventions
const COLUMN_MAPPINGS = {
  asin: ['asin', 'amazon asin', 'product asin', 'item asin'],
  title: ['title', 'product title', 'name', 'product name', 'item title', 'item name'],
  image_url: ['image', 'image url', 'main image', 'image_url', 'imageurl', 'picture', 'photo'],
  category: ['category', 'product category', 'item category', 'dept', 'department'],
  price: ['price', 'product price', 'item price', 'cost', 'sale price', 'list price']
};

/**
 * Find the actual column name in the data that matches our expected field
 */
function findColumn(headers, field) {
  const variations = COLUMN_MAPPINGS[field] || [field];
  const normalizedHeaders = headers.map(h => h?.toString().toLowerCase().trim() || '');
  
  for (const variation of variations) {
    const index = normalizedHeaders.indexOf(variation);
    if (index !== -1) {
      return headers[index];
    }
  }
  
  // Fuzzy match - check if header contains the field name
  for (const header of headers) {
    const normalized = header?.toString().toLowerCase().trim() || '';
    for (const variation of variations) {
      if (normalized.includes(variation) || variation.includes(normalized)) {
        return header;
      }
    }
  }
  
  return null;
}

/**
 * Parse uploaded file (Excel or CSV) into array of row objects
 */
function parseFile(buffer, filename) {
  try {
    // XLSX handles both .xlsx and .csv
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    
    // Convert to JSON array of objects
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (rawData.length < 2) {
      throw new Error('File must have a header row and at least one data row');
    }
    
    const headers = rawData[0];
    const rows = rawData.slice(1);
    
    // Find column mappings
    const asinCol = findColumn(headers, 'asin');
    const titleCol = findColumn(headers, 'title');
    const imageCol = findColumn(headers, 'image_url');
    const categoryCol = findColumn(headers, 'category');
    const priceCol = findColumn(headers, 'price');
    
    if (!asinCol) {
      throw new Error('Could not find ASIN column in file. Expected column named: ASIN, Amazon ASIN, Product ASIN, etc.');
    }
    
    console.log(`📋 Column mappings: ASIN="${asinCol}", Title="${titleCol}", Image="${imageCol}", Category="${categoryCol}", Price="${priceCol}"`);
    
    // Convert to objects with our field names
    const asinIndex = headers.indexOf(asinCol);
    const titleIndex = titleCol ? headers.indexOf(titleCol) : -1;
    const imageIndex = imageCol ? headers.indexOf(imageCol) : -1;
    const categoryIndex = categoryCol ? headers.indexOf(categoryCol) : -1;
    const priceIndex = priceCol ? headers.indexOf(priceCol) : -1;
    
    const data = [];
    for (const row of rows) {
      const asin = row[asinIndex]?.toString().trim().toUpperCase();
      
      // Skip rows without ASIN
      if (!asin) continue;
      
      // Validate ASIN format (B followed by 9 alphanumeric)
      if (!/^B[0-9A-Z]{9}$/i.test(asin)) {
        console.log(`⚠️ Skipping invalid ASIN: ${asin}`);
        continue;
      }
      
      // Helper to sanitize cell values - treats "null", "NULL", empty, etc. as actual null
      const sanitize = (val) => {
        if (val === undefined || val === null) return null;
        const str = val.toString().trim();
        if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'n/a') return null;
        return str;
      };
      
      data.push({
        asin,
        title: titleIndex >= 0 ? sanitize(row[titleIndex])?.substring(0, 500) || null : null,
        image_url: imageIndex >= 0 ? sanitize(row[imageIndex]) : null,
        category: categoryIndex >= 0 ? sanitize(row[categoryIndex]) : null,
        price: priceIndex >= 0 ? parseFloat(row[priceIndex]) || null : null
      });
    }
    
    return data;
  } catch (error) {
    console.error('File parsing error:', error);
    throw new Error(`Failed to parse file: ${error.message}`);
  }
}

/**
 * Parse multipart form data and extract file
 */
function parseMultipart(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    
    if (!contentType?.includes('multipart/form-data')) {
      reject(new Error('Content-Type must be multipart/form-data'));
      return;
    }
    
    const busboy = Busboy({ headers: { 'content-type': contentType } });
    const chunks = [];
    let filename = 'upload';
    
    busboy.on('file', (fieldname, file, info) => {
      filename = info.filename || 'upload';
      console.log(`📁 Receiving file: ${filename}`);
      
      file.on('data', (chunk) => {
        chunks.push(chunk);
      });
    });
    
    busboy.on('error', (error) => {
      console.error('Busboy error:', error);
      reject(error);
    });
    
    busboy.on('finish', () => {
      if (chunks.length === 0) {
        reject(new Error('No file uploaded'));
        return;
      }
      
      const buffer = Buffer.concat(chunks);
      console.log(`📦 File received: ${filename}, ${buffer.length} bytes`);
      resolve({ buffer, filename });
    });
    
    // Handle base64-encoded body (Netlify)
    const body = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
    
    busboy.end(body);
  });
}

/**
 * GET handler - List catalog imports with filters
 */
async function handleGet(event, userId, headers) {
  const params = event.queryStringParameters || {};
  const status = params.status; // pending, processing, processed, error, skipped
  const page = parseInt(params.page) || 1;
  const limit = Math.min(parseInt(params.limit) || 50, 1000);
  const offset = (page - 1) * limit;
  const withCorrelations = params.with_correlations === 'true';
  
  // Sort parameters
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder || 'desc';
  const validSortFields = ['created_at', 'status', 'title', 'asin'];
  const actualSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';
  const ascending = sortOrder === 'asc';
  
  // Search parameter
  const search = params.search?.trim();
  
  // Build query
  let query = getSupabase()
    .from('catalog_imports')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order(actualSortBy, { ascending })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  // Search in ASIN and title
  if (search) {
    query = query.or(`asin.ilike.%${search}%,title.ilike.%${search}%`);
  }
  
  const { data: items, error, count } = await query;
  
  if (error) {
    console.error('Failed to fetch catalog imports:', error);
    return errorResponse(500, 'Failed to fetch catalog imports', headers);
  }
  
  // Get correlation counts AND full data for the fetched ASINs
  let correlationCounts = {};
  let correlationData = {};
  if (items && items.length > 0) {
    const asins = items.map(i => i.asin);
    
    // Query asin_correlations with full data
    const { data: correlations } = await getSupabase()
      .from('asin_correlations')
      .select('search_asin, similar_asin, correlated_title, image_url, suggested_type, correlated_amazon_url')
      .eq('user_id', userId)
      .in('search_asin', asins);
    
    // Count and group correlations per ASIN
    if (correlations) {
      for (const corr of correlations) {
        correlationCounts[corr.search_asin] = (correlationCounts[corr.search_asin] || 0) + 1;
        
        // Group full correlation data by search_asin
        if (!correlationData[corr.search_asin]) {
          correlationData[corr.search_asin] = [];
        }
        correlationData[corr.search_asin].push({
          asin: corr.similar_asin,
          title: corr.correlated_title,
          image_url: corr.image_url,
          type: corr.suggested_type,
          amazonUrl: corr.correlated_amazon_url
        });
      }
    }
  }
  
  // Get status counts
  const { data: statusCounts } = await getSupabase()
    .from('catalog_imports')
    .select('status')
    .eq('user_id', userId);
  
  const counts = {
    total: statusCounts?.length || 0,
    pending: 0,
    processing: 0,
    processed: 0,
    error: 0,
    skipped: 0
  };
  
  for (const item of statusCounts || []) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  
  // Add correlation_count and actual correlations array to each item
  const responseItems = items?.map(item => ({
    ...item,
    correlation_count: correlationCounts[item.asin] || 0,
    // Always return actual correlations array from asin_correlations table
    correlations: correlationData[item.asin] || []
  }));
  
  return successResponse({
    success: true,
    items: responseItems || [],
    pagination: {
      page,
      limit,
      total: count,
      pages: Math.ceil(count / limit)
    },
    counts
  }, headers);
}

/**
 * POST handler - Upload and import file OR accept JSON with pre-parsed ASINs
 */
async function handlePost(event, userId, headers) {
  console.log(`📤 Processing catalog upload for user: ${userId}`);
  
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  let rows;
  let fileData = null; // Declare at function scope for batch tracking
  let importMode = 'skip'; // Default mode: 'skip' or 'merge'
  
  // Check if this is a JSON request (frontend parses file client-side)
  if (contentType.includes('application/json')) {
    console.log('📋 Received JSON with pre-parsed ASINs');
    
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return errorResponse(400, 'Invalid JSON body', headers);
    }
    
    // Handle sync action - queue selected items for correlation finding AND process immediately
    if (body.action === 'sync' && Array.isArray(body.ids)) {
      console.log(`🔄 Syncing ${body.ids.length} items for user: ${userId}`);
      
      const { error } = await getSupabase()
        .from('catalog_imports')
        .update({ status: 'pending', error_message: null })
        .eq('user_id', userId)
        .in('id', body.ids);
      
      if (error) {
        console.error('Sync error:', error);
        return errorResponse(500, `Failed to queue for sync: ${error.message}`, headers);
      }
      
      // Process immediately (don't wait for scheduled function)
      const processResult = await processUserPendingItems(userId, body.ids.length);
      
      return successResponse({
        success: true,
        message: `Processed ${processResult.processed} of ${body.ids.length} items`,
        queued: body.ids.length,
        processed: processResult.processed,
        errors: processResult.errors,
        remaining: processResult.remaining
      }, headers);
    }
    
    // Handle sync_all action - queue ALL imported items for sync
    if (body.action === 'sync_all') {
      console.log(`🔄 Sync All: Queuing all imported items for user: ${userId}`);
      
      // First, count how many will be updated
      const { data: importedItems, error: countError } = await getSupabase()
        .from('catalog_imports')
        .select('id', { count: 'exact' })
        .eq('user_id', userId)
        .eq('status', 'imported');
      
      if (countError) {
        console.error('Sync all count error:', countError);
        return errorResponse(500, `Failed to count items: ${countError.message}`, headers);
      }
      
      const itemCount = importedItems?.length || 0;
      
      if (itemCount === 0) {
        return successResponse({
          success: true,
          message: 'No imported items to queue',
          queued: 0
        }, headers);
      }
      
      // Update all imported items to pending
      const { error: updateError } = await getSupabase()
        .from('catalog_imports')
        .update({ status: 'pending', error_message: null })
        .eq('user_id', userId)
        .eq('status', 'imported');
      
      if (updateError) {
        console.error('Sync all update error:', updateError);
        return errorResponse(500, `Failed to queue items: ${updateError.message}`, headers);
      }
      
      console.log(`✅ Sync All: Queued ${itemCount} items for sync`);
      
      // Process immediately (don't wait for scheduled function)
      const processResult = await processUserPendingItems(userId, 15);
      
      return successResponse({
        success: true,
        message: `Queued ${itemCount} items, processed ${processResult.processed} immediately`,
        queued: itemCount,
        processed: processResult.processed,
        errors: processResult.errors,
        remaining: processResult.remaining
      }, headers);
    }
    
    // Handle fetch_images action - get images from Keepa for ALL ASINs missing images
    if (body.action === 'fetch_images') {
      const KEEPA_API_KEY = process.env.KEEPA_API_KEY;
      if (!KEEPA_API_KEY) {
        return errorResponse(500, 'KEEPA_API_KEY not configured', headers);
      }
      
      // Get ALL ASINs without images for this user
      // Handles: NULL, empty string, and the string literal "null"
      const { data: missingImages, error: fetchError } = await getSupabase()
        .from('catalog_imports')
        .select('id, asin')
        .eq('user_id', userId)
        .or('image_url.is.null,image_url.eq.,image_url.eq.null');
      
      if (fetchError) {
        return errorResponse(500, `Failed to fetch ASINs: ${fetchError.message}`, headers);
      }
      
      if (!missingImages || missingImages.length === 0) {
        return successResponse({
          success: true,
          message: 'All items already have images',
          updated: 0
        }, headers);
      }
      
      console.log(`📸 Fetching images for ${missingImages.length} ASINs (batching in groups of 100)`);
      
      // Process in batches of 100 (Keepa API limit)
      const BATCH_SIZE = 100;
      let totalUpdated = 0;
      let totalTokens = 0;
      let noImageAvailable = 0; // ASINs where Keepa has no image data
      
      for (let i = 0; i < missingImages.length; i += BATCH_SIZE) {
        const batch = missingImages.slice(i, i + BATCH_SIZE);
        const asins = batch.map(r => r.asin);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(missingImages.length / BATCH_SIZE);
        
        console.log(`📦 Processing batch ${batchNum}/${totalBatches} (${asins.length} ASINs)`);
        
        const keepaUrl = `https://api.keepa.com/product?key=${KEEPA_API_KEY}&domain=1&asin=${asins.join(',')}`;
        
        try {
          // Use keepaFetch to handle gzip decompression
          const keepaData = await keepaFetch(keepaUrl);
          
          if (keepaData.error) {
            console.error(`Batch ${batchNum} Keepa error:`, keepaData.error);
            continue; // Skip this batch but continue with others
          }
          
          const products = keepaData.products || [];
          totalTokens += keepaData.tokensConsumed || 0;
          
          console.log(`📸 Batch ${batchNum}: Received ${products.length} products from Keepa`);
          
          // Build image URL map for this batch
          const imageMap = {};
          const productMap = new Map(products.map(p => [p.asin, p]));
          
          for (const product of products) {
            // imagesCSV contains image codes like "51GxQhfGhQL,41ABC123XY"
            // We want the first one (primary image)
            if (product.imagesCSV) {
              const imageCodes = product.imagesCSV.split(',');
              const imageCode = imageCodes[0]?.trim();
              if (imageCode && imageCode.length > 0) {
                // Image codes need the file extension - Amazon uses .jpg for most product images
                const imageUrl = `https://m.media-amazon.com/images/I/${imageCode}._SL500_.jpg`;
                imageMap[product.asin] = imageUrl;
                console.log(`  📷 ${product.asin}: ${imageCode} -> ${imageUrl}`);
              } else {
                noImageAvailable++;
                console.log(`  ⚠️ ${product.asin}: Empty image code`);
              }
            } else {
              noImageAvailable++;
              console.log(`  ⚠️ ${product.asin}: No imagesCSV (Keepa has no image data)`);
            }
          }
          
          // Count ASINs not returned by Keepa
          for (const asin of asins) {
            if (!productMap.has(asin)) {
              noImageAvailable++;
              console.log(`  ⚠️ ${asin}: Not found in Keepa`);
            }
          }
          
          console.log(`📷 Batch ${batchNum}: Found images for ${Object.keys(imageMap).length}/${asins.length} ASINs`);
          
          // Batch update database (more efficient)
          let batchUpdated = 0;
          for (const row of batch) {
            const imageUrl = imageMap[row.asin];
            if (imageUrl) {
              const { error: updateError } = await getSupabase()
                .from('catalog_imports')
                .update({ image_url: imageUrl })
                .eq('id', row.id);
              
              if (!updateError) {
                totalUpdated++;
                batchUpdated++;
              } else {
                console.error(`  ❌ Failed to update ${row.asin}:`, updateError.message);
              }
            }
          }
          
          console.log(`✅ Batch ${batchNum}: Updated ${batchUpdated} images in database`);
          
        } catch (keepaError) {
          console.error(`Batch ${batchNum} error:`, keepaError.message || keepaError);
          // Continue with next batch
        }
      }
      
      console.log(`✅ Complete: Updated ${totalUpdated}/${missingImages.length} images (${noImageAvailable} unavailable from Keepa)`);
      
      // Build informative message
      let message = `Updated ${totalUpdated} images from Keepa`;
      if (noImageAvailable > 0) {
        message += `. ${noImageAvailable} ASINs have no images available in Keepa (new/restricted products).`;
      }
      
      return successResponse({
        success: true,
        message,
        updated: totalUpdated,
        total: missingImages.length,
        noImageAvailable, // How many ASINs had no image data in Keepa
        batches: Math.ceil(missingImages.length / BATCH_SIZE),
        tokensUsed: totalTokens
      }, headers);
    }
    
    // Handle export action - returns CSV data
    if (body.action === 'export') {
      console.log(`📤 Exporting catalog for user: ${userId}`);
      
      // Get all catalog imports for user
      const { data: items, error: fetchError } = await getSupabase()
        .from('catalog_imports')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (fetchError) {
        console.error('Export fetch error:', fetchError);
        return errorResponse(500, `Failed to fetch catalog: ${fetchError.message}`, headers);
      }
      
      if (!items || items.length === 0) {
        return successResponse({
          success: true,
          csv: 'ASIN,Title,Status,Image URL,Category,Price,Correlation Count,Created At\n',
          count: 0
        }, headers);
      }
      
      // Get correlation counts for all ASINs
      const asins = items.map(i => i.asin);
      const { data: correlations } = await getSupabase()
        .from('asin_correlations')
        .select('search_asin')
        .eq('user_id', userId)
        .in('search_asin', asins);
      
      // Count correlations per ASIN
      const correlationCounts = {};
      if (correlations) {
        for (const corr of correlations) {
          correlationCounts[corr.search_asin] = (correlationCounts[corr.search_asin] || 0) + 1;
        }
      }
      
      // Build CSV
      const escapeCSV = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvRows = ['ASIN,Title,Status,Image URL,Category,Price,Correlation Count,Created At'];
      
      for (const item of items) {
        const row = [
          escapeCSV(item.asin),
          escapeCSV(item.title),
          escapeCSV(item.status),
          escapeCSV(item.image_url),
          escapeCSV(item.category),
          escapeCSV(item.price),
          correlationCounts[item.asin] || 0,
          escapeCSV(item.created_at)
        ];
        csvRows.push(row.join(','));
      }
      
      const csv = csvRows.join('\n');
      
      console.log(`✅ Export complete: ${items.length} items`);
      
      return successResponse({
        success: true,
        csv,
        count: items.length
      }, headers);
    }
    
    if (body.action === 'import' && Array.isArray(body.asins)) {
      // Get import mode: 'skip' (default) or 'merge' (update existing records)
      importMode = body.mode === 'merge' ? 'merge' : 'skip';
      
      // Helper to sanitize values - treats "null", "NULL", empty, etc. as actual null
      const sanitize = (val) => {
        if (val === undefined || val === null) return null;
        const str = val.toString().trim();
        if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'n/a') return null;
        return str;
      };
      
      // Validate and normalize ASINs from JSON
      rows = body.asins
        .filter(a => a.asin && /^B[0-9A-Z]{9}$/i.test(a.asin.toString().trim()))
        .map(a => ({
          asin: a.asin.toString().trim().toUpperCase(),
          title: sanitize(a.title)?.substring(0, 500) || null,
          image_url: sanitize(a.image_url),
          category: sanitize(a.category),
          price: a.price ? parseFloat(a.price) : null
        }));
      
      if (rows.length === 0) {
        return errorResponse(400, 'No valid ASINs in request', headers);
      }
      
      console.log(`📊 Received ${rows.length} valid ASINs from JSON (mode: ${importMode})`);
    } else {
      return errorResponse(400, 'Invalid request: expected action=import with asins array', headers);
    }
  } 
  // Otherwise expect multipart form data with file
  else if (contentType.includes('multipart/form-data')) {
    console.log('📁 Received file upload');
    
    try {
      fileData = await parseMultipart(event);
    } catch (error) {
      console.error('File upload error:', error);
      return errorResponse(400, error.message, headers);
    }
    
    // Parse Excel/CSV
    try {
      rows = parseFile(fileData.buffer, fileData.filename);
    } catch (error) {
      console.error('File parsing error:', error);
      return errorResponse(400, error.message, headers);
    }
    
    if (rows.length === 0) {
      return errorResponse(400, 'No valid ASINs found in file', headers);
    }
    
    console.log(`📊 Parsed ${rows.length} valid ASINs from file`);
  } else {
    return errorResponse(400, 'Content-Type must be application/json or multipart/form-data', headers);
  }
  
  // Get existing ASINs to check
  const asins = rows.map(r => r.asin);
  
  // Check influencer_tasks for completed tasks
  const { data: existingTasks } = await getSupabase()
    .from('influencer_tasks')
    .select('asin')
    .eq('user_id', userId)
    .in('asin', asins);
  
  const tasksAsins = new Set(existingTasks?.map(t => t.asin) || []);
  
  // Check catalog_imports for existing imports
  const { data: existingImports } = await getSupabase()
    .from('catalog_imports')
    .select('asin')
    .eq('user_id', userId)
    .in('asin', asins);
  
  const importedAsins = new Set(existingImports?.map(i => i.asin) || []);
  
  console.log(`🔍 Found ${tasksAsins.size} ASINs already in influencer_tasks`);
  console.log(`🔍 Found ${importedAsins.size} ASINs already in catalog_imports (mode: ${importMode})`);
  
  // Prepare rows for insert and update
  const toInsert = [];
  const toUpdate = [];
  const stats = {
    total: rows.length,
    new: 0,
    updated: 0,
    skipped: 0
  };
  
  for (const row of rows) {
    // Skip if already has an influencer task (regardless of mode)
    if (tasksAsins.has(row.asin)) {
      stats.skipped++;
      // Insert as skipped so user can see it
      toInsert.push({
        user_id: userId,
        asin: row.asin,
        title: row.title,
        image_url: row.image_url,
        category: row.category,
        price: row.price,
        status: 'skipped',
        error_message: 'Already has influencer task'
      });
      continue;
    }
    
    // Handle existing catalog imports based on mode
    if (importedAsins.has(row.asin)) {
      if (importMode === 'merge') {
        // Update existing record with new data
        toUpdate.push({
          asin: row.asin,
          title: row.title,
          image_url: row.image_url,
          category: row.category,
          price: row.price
        });
        stats.updated++;
      } else {
        // Skip mode - don't re-insert
        stats.skipped++;
      }
      continue;
    }
    
    // New ASIN to import (status='imported' - user must opt-in to sync)
    toInsert.push({
      user_id: userId,
      asin: row.asin,
      title: row.title,
      image_url: row.image_url,
      category: row.category,
      price: row.price,
      status: 'imported'
    });
    stats.new++;
  }
  
  // Insert new rows
  if (toInsert.length > 0) {
    const { error: insertError } = await getSupabase()
      .from('catalog_imports')
      .upsert(toInsert, { 
        onConflict: 'user_id,asin',
        ignoreDuplicates: true 
      });
    
    if (insertError) {
      console.error('Insert error:', insertError);
      return errorResponse(500, `Failed to import catalog: ${insertError.message}`, headers);
    }
  }
  
  // Update existing rows in merge mode
  if (toUpdate.length > 0) {
    console.log(`📝 Updating ${toUpdate.length} existing records (merge mode)`);
    
    for (const item of toUpdate) {
      const { error: updateError } = await getSupabase()
        .from('catalog_imports')
        .update({
          title: item.title,
          image_url: item.image_url,
          category: item.category,
          price: item.price
        })
        .eq('user_id', userId)
        .eq('asin', item.asin);
      
      if (updateError) {
        console.error(`Failed to update ${item.asin}:`, updateError.message);
      }
    }
  }
  
  // Create batch record for tracking
  const { data: batch, error: batchError } = await getSupabase()
    .from('catalog_import_batches')
    .insert({
      user_id: userId,
      filename: fileData?.filename || 'json-import',
      total_rows: stats.total,
      imported_count: stats.new,
      skipped_count: stats.skipped,
      status: 'completed'
    })
    .select()
    .single();
  
  if (batchError) {
    console.warn('Failed to create batch record:', batchError);
    // Non-fatal, continue
  }
  
  console.log(`✅ Import complete: ${stats.new} new, ${stats.updated} updated, ${stats.skipped} skipped`);
  
  // Build message based on what happened
  let message = `Successfully imported ${stats.new} new ASINs`;
  if (stats.updated > 0) {
    message += `, updated ${stats.updated}`;
  }
  if (stats.skipped > 0) {
    message += `, skipped ${stats.skipped}`;
  }
  
  return successResponse({
    success: true,
    message,
    stats,
    batchId: batch?.id
  }, headers);
}

/**
 * DELETE handler - Clear catalog imports
 */
async function handleDelete(event, userId, headers) {
  const params = event.queryStringParameters || {};
  const status = params.status; // Optional: only delete specific status
  
  let query = getSupabase()
    .from('catalog_imports')
    .delete()
    .eq('user_id', userId);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { error, count } = await query;
  
  if (error) {
    console.error('Delete error:', error);
    return errorResponse(500, 'Failed to delete catalog imports', headers);
  }
  
  return successResponse({
    success: true,
    message: status 
      ? `Deleted ${status} catalog imports`
      : 'Deleted all catalog imports',
    deleted: count
  }, headers);
}

/**
 * Main handler
 */
exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);
  
  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;
  
  try {
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    
    switch (event.httpMethod) {
      case 'GET':
        return await handleGet(event, userId, headers);
      
      case 'POST':
        return await handlePost(event, userId, headers);
      
      case 'DELETE':
        return await handleDelete(event, userId, headers);
      
      default:
        return errorResponse(405, 'Method not allowed', headers);
    }
    
  } catch (error) {
    console.error('Catalog import error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
