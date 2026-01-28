/**
 * Thumbnail Generator - Sharp-based image compositing service
 * Fetches template, overlays product image, saves to storage
 */

const sharp = require('sharp');
const fetch = require('node-fetch');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Constants
const OUTPUT_WIDTH = 1280;
const OUTPUT_HEIGHT = 720;
const OUTPUT_QUALITY = 85;

/**
 * Generate a product image code from ASIN
 * Amazon images use format: https://m.media-amazon.com/images/I/{code}._SL1000_.jpg
 * The code is typically the ASIN with some prefix/suffix variations
 * For now, we'll try common patterns
 * 
 * @param {string} asin - Amazon ASIN
 * @returns {Promise<string|null>} - Product image URL or null if not found
 */
async function findProductImageUrl(asin) {
  // Common Amazon image URL patterns to try
  const patterns = [
    `https://m.media-amazon.com/images/I/${asin}._SL1000_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/I/${asin}._SL1000_.jpg`,
    `https://m.media-amazon.com/images/I/${asin}.jpg`,
  ];

  for (const url of patterns) {
    try {
      const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
      if (response.ok) {
        return url;
      }
    } catch (error) {
      // Try next pattern
      continue;
    }
  }

  return null;
}

/**
 * Download an image from URL as Buffer
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} - Image buffer
 */
async function downloadImage(url) {
  const response = await fetch(url, { timeout: 10000 });
  
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Generate thumbnail by compositing product image onto template
 * 
 * @param {object} options - Generation options
 * @param {string} options.templateId - UUID of template
 * @param {string} options.asin - Amazon ASIN
 * @param {string} options.userId - User ID (for storage path)
 * @param {string} [options.productImageUrl] - Optional direct product image URL
 * @returns {Promise<object>} - { success: boolean, thumbnailUrl?: string, error?: string }
 */
async function generateThumbnail({ templateId, asin, userId, productImageUrl = null }) {
  try {
    // 1. Fetch template from database
    const { data: template, error: templateError } = await supabase
      .from('thumbnail_templates')
      .select('template_storage_path, placement_zone')
      .eq('id', templateId)
      .single();

    if (templateError || !template) {
      return { 
        success: false, 
        error: 'Template not found' 
      };
    }

    // 2. Download template image from storage
    const { data: templateData, error: downloadError } = await supabase.storage
      .from('thumbnail-templates')
      .download(template.template_storage_path);

    if (downloadError || !templateData) {
      return { 
        success: false, 
        error: 'Failed to download template' 
      };
    }

    const templateBuffer = Buffer.from(await templateData.arrayBuffer());

    // 3. Find and download product image
    const finalProductUrl = productImageUrl || await findProductImageUrl(asin);
    
    if (!finalProductUrl) {
      return { 
        success: false, 
        error: 'Product image not found' 
      };
    }

    const productBuffer = await downloadImage(finalProductUrl);

    // 4. Get template dimensions and calculate placement
    const templateImage = sharp(templateBuffer);
    const templateMetadata = await templateImage.metadata();
    
    // Resize template to output dimensions if needed
    let baseImage = templateImage;
    if (templateMetadata.width !== OUTPUT_WIDTH || templateMetadata.height !== OUTPUT_HEIGHT) {
      baseImage = templateImage.resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
        fit: 'cover',
        position: 'center'
      });
    }

    // 5. Calculate placement zone in pixels (zone is stored as percentages)
    const zone = template.placement_zone;
    const zoneLeft = Math.round((zone.x / 100) * OUTPUT_WIDTH);
    const zoneTop = Math.round((zone.y / 100) * OUTPUT_HEIGHT);
    const zoneWidth = Math.round((zone.width / 100) * OUTPUT_WIDTH);
    const zoneHeight = Math.round((zone.height / 100) * OUTPUT_HEIGHT);

    // 6. Resize product image to fit placement zone (maintain aspect ratio)
    const productImage = await sharp(productBuffer)
      .resize(zoneWidth, zoneHeight, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 } // Transparent background
      })
      .toBuffer();

    // 7. Composite product onto template
    const compositeBuffer = await baseImage
      .composite([{
        input: productImage,
        top: zoneTop,
        left: zoneLeft
      }])
      .jpeg({ quality: OUTPUT_QUALITY })
      .toBuffer();

    // 8. Upload to storage
    const fileName = `${userId}/${asin}_${Date.now()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('generated-thumbnails')
      .upload(fileName, compositeBuffer, {
        contentType: 'image/jpeg',
        upsert: false
      });

    if (uploadError) {
      console.error('Failed to upload thumbnail:', uploadError);
      return { 
        success: false, 
        error: 'Failed to upload generated thumbnail' 
      };
    }

    // 9. Generate signed URL (24-hour expiry)
    const { data: signedData, error: signedError } = await supabase.storage
      .from('generated-thumbnails')
      .createSignedUrl(fileName, 86400); // 24 hours

    if (signedError || !signedData?.signedUrl) {
      console.error('Failed to create signed URL:', signedError);
      return { 
        success: false, 
        error: 'Failed to generate thumbnail URL' 
      };
    }

    return {
      success: true,
      thumbnailUrl: signedData.signedUrl,
      storagePath: fileName
    };

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    return {
      success: false,
      error: error.message || 'Internal thumbnail generation error'
    };
  }
}

/**
 * Generate thumbnail for an influencer task
 * Looks up the template by owner (from product), generates thumbnail, and updates task
 * 
 * @param {string} taskId - Influencer task ID
 * @param {string} userId - User ID
 * @returns {Promise<object>} - { success: boolean, thumbnailUrl?: string, error?: string }
 */
async function generateThumbnailForTask(taskId, userId) {
  try {
    // 1. Get task details
    const { data: task, error: taskError } = await supabase
      .from('influencer_tasks')
      .select('asin, video_id')
      .eq('id', taskId)
      .eq('user_id', userId)
      .single();

    if (taskError || !task) {
      return { 
        success: false, 
        error: 'Task not found' 
      };
    }

    if (!task.asin) {
      return { 
        success: false, 
        error: 'Task has no ASIN' 
      };
    }

    // 2. Find owner via product (ASIN -> sourced_products -> product_owners)
    let ownerId = null;
    
    // First try to get owner from the product via ASIN
    const { data: product } = await supabase
      .from('sourced_products')
      .select('id')
      .eq('asin', task.asin)
      .eq('user_id', userId)
      .single();
    
    if (product) {
      const { data: owner } = await supabase
        .from('product_owners')
        .select('owner_id')
        .eq('product_id', product.id)
        .eq('is_primary', true)
        .single();
      
      ownerId = owner?.owner_id;
    }
    
    // If no owner found via product, try via video (if task has video_id)
    if (!ownerId && task.video_id) {
      const { data: video } = await supabase
        .from('product_videos')
        .select('product_id')
        .eq('id', task.video_id)
        .single();
      
      if (video?.product_id) {
        const { data: owner } = await supabase
          .from('product_owners')
          .select('owner_id')
          .eq('product_id', video.product_id)
          .eq('is_primary', true)
          .single();
        
        ownerId = owner?.owner_id;
      }
    }

    if (!ownerId) {
      return { 
        success: false, 
        error: 'No owner found for this product. Please assign an owner first.' 
      };
    }

    // 3. Find template for this owner
    const { data: template, error: templateError } = await supabase
      .from('thumbnail_templates')
      .select('id')
      .eq('user_id', userId)
      .eq('owner_id', ownerId)
      .single();

    if (templateError || !template) {
      return { 
        success: false, 
        error: 'No template found for this owner' 
      };
    }

    // 4. Generate thumbnail
    const result = await generateThumbnail({
      templateId: template.id,
      asin: task.asin,
      userId
    });

    if (!result.success) {
      return result;
    }

    // 5. Update task image_url with thumbnail URL (using existing column)
    const { error: updateError } = await supabase
      .from('influencer_tasks')
      .update({
        image_url: result.thumbnailUrl
      })
      .eq('id', taskId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('Failed to update task with thumbnail:', updateError);
      return { 
        success: false, 
        error: 'Failed to save thumbnail to task' 
      };
    }

    return {
      success: true,
      thumbnailUrl: result.thumbnailUrl
    };

  } catch (error) {
    console.error('Error generating thumbnail for task:', error);
    return {
      success: false,
      error: error.message || 'Internal error'
    };
  }
}

module.exports = {
  generateThumbnail,
  generateThumbnailForTask,
  findProductImageUrl
};
