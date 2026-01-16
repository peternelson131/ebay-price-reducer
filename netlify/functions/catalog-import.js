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
      
      data.push({
        asin,
        title: titleIndex >= 0 ? row[titleIndex]?.toString().trim() || null : null,
        image_url: imageIndex >= 0 ? row[imageIndex]?.toString().trim() || null : null,
        category: categoryIndex >= 0 ? row[categoryIndex]?.toString().trim() || null : null,
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
  
  // Build query
  let query = getSupabase()
    .from('catalog_imports')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data: items, error, count } = await query;
  
  if (error) {
    console.error('Failed to fetch catalog imports:', error);
    return errorResponse(500, 'Failed to fetch catalog imports', headers);
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
  
  // Optionally filter out correlations to reduce payload
  const responseItems = withCorrelations ? items : items?.map(item => ({
    ...item,
    correlations: item.correlations ? `[${item.correlation_count} items]` : null
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
  
  // Check if this is a JSON request (frontend parses file client-side)
  if (contentType.includes('application/json')) {
    console.log('📋 Received JSON with pre-parsed ASINs');
    
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      return errorResponse(400, 'Invalid JSON body', headers);
    }
    
    // Handle sync action - queue selected items for correlation finding
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
      
      return successResponse({
        success: true,
        message: `Queued ${body.ids.length} items for sync`,
        queued: body.ids.length
      }, headers);
    }
    
    if (body.action === 'import' && Array.isArray(body.asins)) {
      // Validate and normalize ASINs from JSON
      rows = body.asins
        .filter(a => a.asin && /^B[0-9A-Z]{9}$/i.test(a.asin.toString().trim()))
        .map(a => ({
          asin: a.asin.toString().trim().toUpperCase(),
          title: a.title?.toString().substring(0, 500) || null,
          image_url: a.image_url || null,
          category: a.category || null,
          price: a.price ? parseFloat(a.price) : null
        }));
      
      if (rows.length === 0) {
        return errorResponse(400, 'No valid ASINs in request', headers);
      }
      
      console.log(`📊 Received ${rows.length} valid ASINs from JSON`);
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
  
  // Get existing ASINs to skip
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
  console.log(`🔍 Found ${importedAsins.size} ASINs already in catalog_imports`);
  
  // Prepare rows for insert, marking duplicates as skipped
  const toInsert = [];
  const stats = {
    total: rows.length,
    imported: 0,
    skipped_tasks: 0,
    skipped_existing: 0
  };
  
  for (const row of rows) {
    // Skip if already has an influencer task
    if (tasksAsins.has(row.asin)) {
      stats.skipped_tasks++;
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
    
    // Skip if already imported
    if (importedAsins.has(row.asin)) {
      stats.skipped_existing++;
      continue; // Don't re-insert, just skip
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
    stats.imported++;
  }
  
  // Insert rows (use upsert to handle race conditions)
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
  
  // Create batch record for tracking
  const { data: batch, error: batchError } = await getSupabase()
    .from('catalog_import_batches')
    .insert({
      user_id: userId,
      filename: fileData?.filename || 'json-import',
      total_rows: stats.total,
      imported_count: stats.imported,
      skipped_count: stats.skipped_tasks + stats.skipped_existing,
      status: 'completed'
    })
    .select()
    .single();
  
  if (batchError) {
    console.warn('Failed to create batch record:', batchError);
    // Non-fatal, continue
  }
  
  console.log(`✅ Import complete: ${stats.imported} imported, ${stats.skipped_tasks + stats.skipped_existing} skipped`);
  
  return successResponse({
    success: true,
    message: `Successfully imported ${stats.imported} ASINs`,
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
