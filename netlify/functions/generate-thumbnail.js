/**
 * Generate Thumbnail - Auto-generate thumbnail when owner assigned to product
 * 
 * POST /generate-thumbnail
 * Body: { product_id, owner_id }
 * 
 * Flow:
 * 1. Get owner's thumbnail template
 * 2. Get product's image URL (from sourced_products or Keepa)
 * 3. Composite product image onto template
 * 4. Upload to OneDrive (user's connected drive)
 * 5. Return thumbnail URL
 */

const { createClient } = require('@supabase/supabase-js');
const sharp = require('sharp');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Thumbnail dimensions
const THUMBNAIL_WIDTH = 1280;
const THUMBNAIL_HEIGHT = 720;

/**
 * Fetch image from URL and return as buffer
 */
async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate composite thumbnail
 */
async function generateThumbnail(templateBuffer, productImageBuffer, placementZone) {
  // Load template
  const template = sharp(templateBuffer);
  const templateMeta = await template.metadata();
  
  // Calculate actual pixel positions from percentages
  const zoneX = Math.round((placementZone.x / 100) * templateMeta.width);
  const zoneY = Math.round((placementZone.y / 100) * templateMeta.height);
  const zoneWidth = Math.round((placementZone.width / 100) * templateMeta.width);
  const zoneHeight = Math.round((placementZone.height / 100) * templateMeta.height);
  
  // Resize product image to fit zone while maintaining aspect ratio
  const productImage = await sharp(productImageBuffer)
    .resize(zoneWidth, zoneHeight, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 0 }
    })
    .toBuffer();
  
  // Composite product onto template
  const composited = await template
    .composite([{
      input: productImage,
      left: zoneX,
      top: zoneY
    }])
    .resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, {
      fit: 'fill'
    })
    .jpeg({ quality: 85 })
    .toBuffer();
  
  return composited;
}

/**
 * Upload thumbnail to OneDrive
 */
async function uploadToOneDrive(userId, thumbnailBuffer, filename) {
  // Check if user has OneDrive connected
  console.log('Looking up OneDrive connection for user:', userId);
  
  const { data: connection, error: connError } = await supabase
    .from('onedrive_connections')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  console.log('OneDrive connection lookup result:', { found: !!connection, error: connError?.message });
  
  if (!connection) {
    // Debug: check all connections to see what user_ids exist
    const { data: allConns } = await supabase
      .from('onedrive_connections')
      .select('user_id')
      .limit(5);
    console.log('Available connection user_ids:', allConns?.map(c => c.user_id));
    
    throw new Error(`OneDrive not connected. User ID: ${userId}`);
  }
  
  // Get user's thumbnail folder preference
  const { data: userProfile } = await supabase
    .from('users')
    .select('thumbnail_folder_path')
    .eq('id', userId)
    .single();
  
  const folderPath = userProfile?.thumbnail_folder_path || '/Thumbnails';
  
  // Upload to OneDrive in user's configured folder
  const uploadPath = `/Apps/eBay Price Reducer${folderPath}/${filename}`;
  
  try {
    const result = await graphApiRequest(
      userId,
      `/me/drive/root:${uploadPath}:/content`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'image/jpeg'
        },
        body: thumbnailBuffer
      }
    );
    
    return {
      onedrive_file_id: result.id,
      onedrive_path: uploadPath,
      web_url: result.webUrl
    };
  } catch (error) {
    console.error('OneDrive upload error:', error);
    throw new Error(`Failed to upload to OneDrive: ${error.message}`);
  }
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  try {
    // Verify auth
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const body = JSON.parse(event.body || '{}');
    const { product_id, owner_id } = body;

    if (!product_id || !owner_id) {
      return errorResponse(400, 'Missing required fields: product_id, owner_id', headers);
    }

    console.log(`Generating thumbnail for product ${product_id} with owner ${owner_id}`);

    // 1. Get owner's thumbnail template
    const { data: template, error: templateError } = await supabase
      .from('thumbnail_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('owner_id', owner_id)
      .single();

    if (templateError || !template) {
      console.log('No template found for owner', owner_id);
      return successResponse({
        success: false,
        skipped: true,
        reason: 'No thumbnail template configured for this owner'
      }, headers);
    }

    // 2. Get product info (for image URL)
    const { data: product, error: productError } = await supabase
      .from('sourced_products')
      .select('id, asin, title, image_url')
      .eq('id', product_id)
      .single();

    if (productError || !product) {
      return errorResponse(404, 'Product not found', headers);
    }

    // Get product image URL - use stored image_url or construct from ASIN
    let productImageUrl = product.image_url;
    if (!productImageUrl && product.asin) {
      // Try Amazon image URL pattern
      productImageUrl = `https://m.media-amazon.com/images/I/${product.asin}._SL1000_.jpg`;
    }

    if (!productImageUrl) {
      return successResponse({
        success: false,
        skipped: true,
        reason: 'Product has no image available'
      }, headers);
    }

    console.log('Product image URL:', productImageUrl);

    // 3. Fetch template image from Supabase Storage
    const { data: templateUrlData } = await supabase.storage
      .from('thumbnail-templates')
      .createSignedUrl(template.template_storage_path, 300);

    if (!templateUrlData?.signedUrl) {
      return errorResponse(500, 'Failed to get template image', headers);
    }

    // 4. Fetch both images
    let templateBuffer, productImageBuffer;
    try {
      [templateBuffer, productImageBuffer] = await Promise.all([
        fetchImageBuffer(templateUrlData.signedUrl),
        fetchImageBuffer(productImageUrl)
      ]);
    } catch (error) {
      console.error('Image fetch error:', error);
      return errorResponse(500, `Failed to fetch images: ${error.message}`, headers);
    }

    // 5. Generate composite thumbnail
    let thumbnailBuffer;
    try {
      thumbnailBuffer = await generateThumbnail(
        templateBuffer,
        productImageBuffer,
        template.placement_zone
      );
    } catch (error) {
      console.error('Thumbnail generation error:', error);
      return errorResponse(500, `Failed to generate thumbnail: ${error.message}`, headers);
    }

    console.log('Thumbnail generated, size:', thumbnailBuffer.length);

    // 6. Upload to OneDrive
    const timestamp = Date.now();
    const filename = `${product.asin || product_id}_${timestamp}.jpg`;
    
    let uploadResult;
    try {
      uploadResult = await uploadToOneDrive(userId, thumbnailBuffer, filename);
    } catch (error) {
      console.error('Upload error:', error);
      return errorResponse(500, error.message, headers);
    }

    console.log('Uploaded to OneDrive:', uploadResult);

    // 7. Store reference in product_thumbnails table (or update sourced_products)
    // For now, we'll store in a new table or return the URL
    // The caller can decide where to store it

    return successResponse({
      success: true,
      thumbnail: {
        product_id,
        owner_id,
        filename,
        onedrive_file_id: uploadResult.onedrive_file_id,
        onedrive_path: uploadResult.onedrive_path,
        web_url: uploadResult.web_url
      }
    }, headers);

  } catch (error) {
    console.error('Generate thumbnail error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
