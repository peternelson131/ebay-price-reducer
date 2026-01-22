/**
 * Generate Thumbnail - Composite product image onto template
 * 
 * POST /generate-thumbnail
 * Body: { 
 *   template_id: UUID,
 *   asin: string,
 *   product_image_url?: string (optional, defaults to Keepa pattern)
 * }
 * 
 * Returns: { success: true, thumbnail_url: string }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const fetch = require('node-fetch');
const sharp = require('sharp');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Thumbnail output settings
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const OUTPUT_QUALITY = 85;

/**
 * Extract ASIN image code from URL or construct Keepa URL
 */
function getProductImageUrl(asin, providedUrl) {
  if (providedUrl) return providedUrl;
  
  // Default Keepa pattern: https://m.media-amazon.com/images/I/{asin}._SL1000_.jpg
  // Note: ASIN isn't the image code - need to fetch from Keepa API or use provided URL
  // For now, we'll require the product_image_url to be provided
  return null;
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
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const body = JSON.parse(event.body || '{}');
    const { template_id, asin, product_image_url } = body;

    // Validation
    if (!template_id || !asin) {
      return errorResponse(400, 'Missing required fields: template_id, asin', headers);
    }

    if (!product_image_url) {
      return errorResponse(400, 'product_image_url is required (Amazon/Keepa product image URL)', headers);
    }

    // ─────────────────────────────────────────────────────────
    // Fetch template from database
    // ─────────────────────────────────────────────────────────
    const { data: template, error: templateError } = await supabase
      .from('thumbnail_templates')
      .select('*')
      .eq('id', template_id)
      .eq('user_id', userId)
      .single();

    if (templateError || !template) {
      return errorResponse(404, 'Template not found', headers);
    }

    console.log(`🎨 Generating thumbnail for ASIN ${asin} using template "${template.owner_name}"`);

    // ─────────────────────────────────────────────────────────
    // Download template image from Supabase Storage
    // ─────────────────────────────────────────────────────────
    const { data: templateData, error: downloadError } = await supabase.storage
      .from('thumbnail-templates')
      .download(template.template_storage_path);

    if (downloadError || !templateData) {
      console.error('Template download error:', downloadError);
      return errorResponse(500, 'Failed to download template image', headers);
    }

    const templateBuffer = Buffer.from(await templateData.arrayBuffer());

    // ─────────────────────────────────────────────────────────
    // Download product image
    // ─────────────────────────────────────────────────────────
    console.log(`📥 Fetching product image from: ${product_image_url}`);
    
    const productResponse = await fetch(product_image_url);
    if (!productResponse.ok) {
      console.error('Product image fetch failed:', productResponse.status);
      return errorResponse(400, `Failed to fetch product image: ${productResponse.statusText}`, headers);
    }

    const productBuffer = Buffer.from(await productResponse.arrayBuffer());

    // ─────────────────────────────────────────────────────────
    // Image Compositing with Sharp
    // ─────────────────────────────────────────────────────────
    
    // Get template dimensions to calculate pixel positions from percentages
    const templateMetadata = await sharp(templateBuffer).metadata();
    const templateWidth = templateMetadata.width;
    const templateHeight = templateMetadata.height;

    // Convert percentage-based placement zone to pixels
    const zone = template.placement_zone;
    const zonePixels = {
      left: Math.round((zone.x / 100) * templateWidth),
      top: Math.round((zone.y / 100) * templateHeight),
      width: Math.round((zone.width / 100) * templateWidth),
      height: Math.round((zone.height / 100) * templateHeight)
    };

    console.log(`📐 Placement zone: ${JSON.stringify(zone)}% → ${JSON.stringify(zonePixels)}px`);

    // Resize product image to fit within zone (maintain aspect ratio)
    const resizedProduct = await sharp(productBuffer)
      .resize(zonePixels.width, zonePixels.height, {
        fit: 'inside',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    // Get resized product dimensions to center it in the zone
    const productMetadata = await sharp(resizedProduct).metadata();
    const productWidth = productMetadata.width;
    const productHeight = productMetadata.height;

    // Center product in zone
    const centeredLeft = zonePixels.left + Math.round((zonePixels.width - productWidth) / 2);
    const centeredTop = zonePixels.top + Math.round((zonePixels.height - productHeight) / 2);

    console.log(`🖼️  Product: ${productWidth}x${productHeight} centered at (${centeredLeft}, ${centeredTop})`);

    // Composite product onto template
    const compositeBuffer = await sharp(templateBuffer)
      .composite([{
        input: resizedProduct,
        left: centeredLeft,
        top: centeredTop
      }])
      .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: OUTPUT_QUALITY })
      .toBuffer();

    console.log(`✅ Generated thumbnail: ${compositeBuffer.length} bytes`);

    // ─────────────────────────────────────────────────────────
    // Upload to Supabase Storage
    // ─────────────────────────────────────────────────────────
    const timestamp = Date.now();
    const storagePath = `${userId}/${timestamp}_${asin}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('generated-thumbnails')
      .upload(storagePath, compositeBuffer, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (uploadError) {
      console.error('Thumbnail upload error:', uploadError);
      return errorResponse(500, `Failed to upload thumbnail: ${uploadError.message}`, headers);
    }

    // Get signed URL (3 days expiry)
    const { data: urlData } = await supabase.storage
      .from('generated-thumbnails')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 3);

    if (!urlData?.signedUrl) {
      return errorResponse(500, 'Failed to generate signed URL', headers);
    }

    console.log(`🎉 Thumbnail ready: ${storagePath}`);

    return successResponse({
      success: true,
      thumbnail_url: urlData.signedUrl,
      storage_path: storagePath,
      template_used: template.owner_name,
      dimensions: {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT
      }
    }, headers);

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
