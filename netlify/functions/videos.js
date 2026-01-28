/**
 * Videos - Video metadata CRUD operations
 * 
 * GET    /videos?productId=xxx              - List videos for user/product
 * POST   /videos                             - Save video metadata after upload
 * DELETE /videos/:id                         - Remove video record
 * PATCH  /videos/:id                         - Update video metadata
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Generate a video title for the product based on owner prefix and product title
 * Saves the generated title to sourced_products.video_title
 */
async function generateVideoTitle(userId, productId) {
  try {
    // Get product with owner
    const { data: product, error: productError } = await supabase
      .from('sourced_products')
      .select('title, owner_id')
      .eq('id', productId)
      .single();
    
    if (productError || !product) {
      console.log('No product found for video title generation:', productError?.message);
      return null;
    }
    
    // Get owner's title prefix
    let titlePrefix = 'Honest Review';
    if (product.owner_id) {
      const { data: owner } = await supabase
        .from('crm_owners')
        .select('title_prefix')
        .eq('id', product.owner_id)
        .single();
      
      if (owner?.title_prefix) {
        titlePrefix = owner.title_prefix;
      }
    }
    
    // Generate title: "{prefix} {product_title}"
    const videoTitle = `${titlePrefix} ${product.title || 'Video'}`;
    
    // Save to product
    const { error: updateError } = await supabase
      .from('sourced_products')
      .update({ video_title: videoTitle })
      .eq('id', productId);
    
    if (updateError) {
      console.error('Failed to update video_title on product:', updateError.message);
      return null;
    }
    
    console.log(`✅ Generated video title for product ${productId}: "${videoTitle}"`);
    return videoTitle;
  } catch (err) {
    console.error('Error generating video title:', err.message);
    return null;
  }
}

/**
 * Create influencer tasks for all accepted correlated ASINs
 * Creates tasks for each available marketplace (US, CA, UK, DE)
 */
async function createInfluencerTasksForCorrelatedAsins(userId, productId, videoId) {
  try {
    // Get product ASIN
    const { data: product, error: productError } = await supabase
      .from('sourced_products')
      .select('asin')
      .eq('id', productId)
      .single();
    
    if (productError || !product?.asin) {
      console.log('No product or ASIN found for influencer task creation:', productError?.message);
      return 0;
    }
    
    // Find accepted correlations for this ASIN
    const { data: correlations, error: correlationsError } = await supabase
      .from('asin_correlations')
      .select('similar_asin, correlated_title, image_url, available_us, available_ca, available_uk, available_de')
      .eq('search_asin', product.asin)
      .eq('user_id', userId)
      .eq('decision', 'accepted');
    
    if (correlationsError) {
      console.error('Error fetching correlations:', correlationsError);
      return 0;
    }
    
    if (!correlations || correlations.length === 0) {
      console.log(`No accepted correlations found for ASIN ${product.asin}`);
      return 0;
    }
    
    const marketplaceUrls = {
      US: (asin) => `https://www.amazon.com/dp/${asin}`,
      CA: (asin) => `https://www.amazon.ca/dp/${asin}`,
      UK: (asin) => `https://www.amazon.co.uk/dp/${asin}`,
      DE: (asin) => `https://www.amazon.de/dp/${asin}`
    };
    
    const tasksToCreate = [];
    
    for (const corr of correlations) {
      const availabilityMap = {
        US: corr.available_us,
        CA: corr.available_ca,
        UK: corr.available_uk,
        DE: corr.available_de
      };
      
      for (const [marketplace, available] of Object.entries(availabilityMap)) {
        if (available) {
          tasksToCreate.push({
            user_id: userId,
            asin: corr.similar_asin,
            search_asin: product.asin,
            product_title: corr.correlated_title,
            image_url: corr.image_url,
            marketplace,
            status: 'pending',
            video_id: videoId,
            amazon_upload_url: marketplaceUrls[marketplace](corr.similar_asin)
          });
        }
      }
    }
    
    if (tasksToCreate.length === 0) {
      console.log('No available marketplaces found in correlations');
      return 0;
    }
    
    // Upsert tasks (update video_id if task exists)
    const { error: upsertError } = await supabase
      .from('influencer_tasks')
      .upsert(tasksToCreate, {
        onConflict: 'user_id,asin,marketplace',
        ignoreDuplicates: false // Update video_id if task exists
      });
    
    if (upsertError) {
      console.error('Failed to create influencer tasks:', upsertError);
      return 0;
    }
    
    console.log(`✅ Created/updated ${tasksToCreate.length} influencer task(s) for ${correlations.length} correlated ASIN(s)`);
    return tasksToCreate.length;
  } catch (error) {
    console.error('Error in createInfluencerTasksForCorrelatedAsins:', error);
    return 0;
  }
}

/**
 * Update product status to "Video Made" after video attachment
 * Looks up the status ID for "Video Made" for the user and updates the product
 */
async function updateProductStatusToVideoMade(userId, productId) {
  if (!productId) return;
  
  try {
    // Find "Video Made" status for this user
    const { data: status, error: statusError } = await supabase
      .from('crm_statuses')
      .select('id')
      .eq('user_id', userId)
      .ilike('name', 'video made')
      .single();
    
    if (statusError || !status?.id) {
      console.log('No "Video Made" status found for user:', statusError?.message);
      return;
    }
    
    // Update the product's status
    const { error: updateError } = await supabase
      .from('sourced_products')
      .update({ status_id: status.id })
      .eq('id', productId)
      .eq('user_id', userId);
    
    if (updateError) {
      console.error('Failed to update product status to Video Made:', updateError.message);
    } else {
      console.log(`✅ Product ${productId} status updated to "Video Made"`);
    }
  } catch (err) {
    console.error('Error updating product status:', err.message);
  }
}

/**
 * Trigger background transcode job (fire and forget)
 * Called after video creation to pre-transcode for social posting
 */
function triggerBackgroundTranscode(videoId) {
  const functionUrl = `${process.env.URL}/.netlify/functions/video-transcode-background`;
  
  // Fire and forget - don't await, don't block response
  fetch(functionUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoId })
  })
    .then(() => console.log(`Triggered background transcode for video ${videoId}`))
    .catch(err => console.error(`Failed to trigger transcode for video ${videoId}:`, err.message));
}

/**
 * GET - List videos
 */
async function handleGet(userId, params) {
  const { productId, status } = params;

  let query = supabase
    .from('product_videos')
    .select('*')
    .eq('user_id', userId);

  if (productId) {
    query = query.eq('product_id', productId);
  }

  if (status) {
    query = query.eq('upload_status', status);
  }

  // Order by most recent first
  query = query.order('created_at', { ascending: false });

  const { data: videos, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch videos: ${error.message}`);
  }

  return {
    videos,
    totalCount: videos.length
  };
}

/**
 * POST - Create/update video metadata after successful upload
 */
async function handlePost(userId, body) {
  const {
    sessionId,           // From upload session
    productId,
    onedrive_file_id,   // From OneDrive after upload completes
    onedrive_path,
    filename,
    file_size,
    mime_type,
    thumbnail_url,
    duration_seconds
  } = body;

  // Required fields
  if (!onedrive_file_id || !filename) {
    throw new Error('onedrive_file_id and filename are required');
  }

  // If sessionId provided, update existing record
  if (sessionId) {
    const { data: updated, error } = await supabase
      .from('product_videos')
      .update({
        onedrive_file_id,
        onedrive_path: onedrive_path || undefined,
        filename: filename || undefined,
        file_size: file_size || undefined,
        mime_type: mime_type || undefined,
        thumbnail_url: thumbnail_url || undefined,
        duration_seconds: duration_seconds || undefined,
        upload_status: 'complete'
      })
      .eq('id', sessionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update video: ${error.message}`);
    }

    // Auto-link video to approved tasks if product_id exists
    let linkedTaskCount = 0;
    if (updated.product_id) {
      linkedTaskCount = await linkVideoToApprovedTasks(userId, updated.product_id, updated.id);
      // Auto-update product status to "Video Made"
      await updateProductStatusToVideoMade(userId, updated.product_id);
    }

    // Auto-generate video title
    let videoTitle = null;
    if (updated.product_id) {
      videoTitle = await generateVideoTitle(userId, updated.product_id);
    }

    // Create influencer tasks for correlated ASINs
    let createdTaskCount = 0;
    if (updated.product_id) {
      createdTaskCount = await createInfluencerTasksForCorrelatedAsins(userId, updated.product_id, updated.id);
    }

    // Trigger background transcode (fire and forget)
    triggerBackgroundTranscode(updated.id);

    return { ...updated, linkedTaskCount, createdTaskCount, videoTitle };
  }

  // Otherwise, create new record
  const { data: created, error: insertError } = await supabase
    .from('product_videos')
    .insert({
      user_id: userId,
      product_id: productId || null,
      onedrive_file_id,
      onedrive_path: onedrive_path || `/${filename}`,
      filename,
      file_size: file_size || null,
      mime_type: mime_type || null,
      thumbnail_url: thumbnail_url || null,
      duration_seconds: duration_seconds || null,
      upload_status: 'complete'
    })
    .select()
    .single();

  if (insertError) {
    // Handle duplicate constraint violation
    if (insertError.code === '23505') { // Unique constraint violation
      throw new Error('Video already exists with this OneDrive file ID');
    }
    throw new Error(`Failed to create video: ${insertError.message}`);
  }

  // Auto-link video to approved tasks for this product
  let linkedTaskCount = 0;
  if (productId && created.id) {
    linkedTaskCount = await linkVideoToApprovedTasks(userId, productId, created.id);
    // Auto-update product status to "Video Made"
    await updateProductStatusToVideoMade(userId, productId);
  }

  // Auto-generate video title
  let videoTitle = null;
  if (productId) {
    videoTitle = await generateVideoTitle(userId, productId);
  }

  // Create influencer tasks for correlated ASINs
  let createdTaskCount = 0;
  if (productId && created.id) {
    createdTaskCount = await createInfluencerTasksForCorrelatedAsins(userId, productId, created.id);
  }

  // Trigger background transcode (fire and forget)
  triggerBackgroundTranscode(created.id);

  return { ...created, linkedTaskCount, createdTaskCount, videoTitle };
}

/**
 * Link a video to all approved influencer tasks for the product
 * Flow: product -> ASIN -> tasks with matching ASIN and approved feedback
 */
async function linkVideoToApprovedTasks(userId, productId, videoId) {
  try {
    // 1. Get the product's ASIN
    const { data: product, error: productError } = await supabase
      .from('sourced_products')
      .select('asin')
      .eq('id', productId)
      .single();

    if (productError || !product?.asin) {
      console.log('No product or ASIN found for video linking:', productError?.message);
      return 0;
    }

    // 2. Find tasks for this ASIN that don't have a video yet
    // Join with feedback to filter for approved tasks only
    const { data: tasksToLink, error: tasksError } = await supabase
      .from('influencer_tasks')
      .select(`
        id,
        feedback_id,
        asin_correlation_feedback!inner (
          decision
        )
      `)
      .eq('user_id', userId)
      .eq('asin', product.asin)
      .is('video_id', null)
      .eq('asin_correlation_feedback.decision', 'accepted');

    if (tasksError) {
      console.error('Error finding tasks to link:', tasksError);
      return 0;
    }

    if (!tasksToLink || tasksToLink.length === 0) {
      console.log('No accepted tasks found for ASIN:', product.asin);
      return 0;
    }

    const taskIds = tasksToLink.map(t => t.id);

    // 3. Update tasks with the video_id
    const { data: updatedTasks, error: updateError } = await supabase
      .from('influencer_tasks')
      .update({ video_id: videoId })
      .in('id', taskIds)
      .select('id');

    if (updateError) {
      console.error('Error linking video to tasks:', updateError);
      return 0;
    }

    const linkedCount = updatedTasks?.length || 0;
    console.log(`Linked video ${videoId} to ${linkedCount} approved task(s) for ASIN ${product.asin}`);
    return linkedCount;
  } catch (error) {
    console.error('Error in linkVideoToApprovedTasks:', error);
    return 0;
  }
}

/**
 * PATCH - Update video metadata
 */
async function handlePatch(userId, videoId, body) {
  const allowedFields = [
    'product_id',
    'thumbnail_url',
    'duration_seconds',
    'upload_status',
    'social_ready_status' // Allow manual retry of failed transcodes by setting to 'pending'
  ];

  // Filter to only allowed fields
  const updates = {};
  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new Error('No valid fields to update');
  }

  const { data: updated, error } = await supabase
    .from('product_videos')
    .update(updates)
    .eq('id', videoId)
    .eq('user_id', userId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') { // No rows returned
      throw new Error('Video not found or does not belong to user');
    }
    throw new Error(`Failed to update video: ${error.message}`);
  }

  return updated;
}

/**
 * DELETE - Remove video record
 * Note: Does NOT delete from OneDrive, only removes DB record
 */
async function handleDelete(userId, videoId, params) {
  const { deleteFromOneDrive } = params;

  // First get the video to check ownership and get file ID
  const { data: video, error: fetchError } = await supabase
    .from('product_videos')
    .select('*')
    .eq('id', videoId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !video) {
    throw new Error('Video not found or does not belong to user');
  }

  // Delete from OneDrive if requested
  if (deleteFromOneDrive === 'true' && video.onedrive_file_id !== 'pending') {
    try {
      await graphApiRequest(
        userId, 
        `/me/drive/items/${video.onedrive_file_id}`,
        { method: 'DELETE' }
      );
    } catch (error) {
      console.error('Failed to delete file from OneDrive:', error);
      // Continue with DB deletion even if OneDrive delete fails
    }
  }

  // Delete database record
  const { error: deleteError } = await supabase
    .from('product_videos')
    .delete()
    .eq('id', videoId)
    .eq('user_id', userId);

  if (deleteError) {
    throw new Error(`Failed to delete video: ${deleteError.message}`);
  }

  return {
    success: true,
    message: 'Video deleted',
    deletedFromOneDrive: deleteFromOneDrive === 'true'
  };
}

// =============================================================================
// Main Handler
// =============================================================================

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Verify user authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return {
        statusCode: authResult.statusCode,
        headers,
        body: JSON.stringify({ error: authResult.error })
      };
    }

    const userId = authResult.userId;
    const method = event.httpMethod;
    const params = event.queryStringParameters || {};
    
    // Extract video ID from path for DELETE/PATCH
    const pathParts = event.path.split('/');
    const videoId = pathParts[pathParts.length - 1];

    let result;

    switch (method) {
      case 'GET':
        result = await handleGet(userId, params);
        break;

      case 'POST':
        const postBody = JSON.parse(event.body || '{}');
        result = await handlePost(userId, postBody);
        break;

      case 'PATCH':
        if (!videoId || videoId === 'videos') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Video ID required in path' })
          };
        }
        const patchBody = JSON.parse(event.body || '{}');
        result = await handlePatch(userId, videoId, patchBody);
        break;

      case 'DELETE':
        if (!videoId || videoId === 'videos') {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({ error: 'Video ID required in path' })
          };
        }
        result = await handleDelete(userId, videoId, params);
        break;

      default:
        return {
          statusCode: 405,
          headers,
          body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error('Videos API error:', error);
    
    return {
      statusCode: error.message.includes('not found') ? 404 : 500,
      headers,
      body: JSON.stringify({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};
