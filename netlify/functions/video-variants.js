/**
 * Video Variants API - Manage dubbed video versions
 * 
 * POST /video-variants - Trigger dubbing for a video
 * GET /video-variants?videoId=xxx - Get variants for a video
 * GET /video-variants/:id - Get specific variant status
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');
const { graphApiRequest, getValidAccessToken } = require('./utils/onedrive-api');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Language code to full name mapping
const LANGUAGE_NAMES = {
  'de': 'German',
  'fr': 'French',
  'es': 'Spanish',
  'it': 'Italian',
  'ja': 'Japanese'
};

/**
 * Create OneDrive subfolder for language if it doesn't exist
 */
async function ensureLanguageFolder(userId, parentFolderId, language) {
  const folderName = `content-${language.toLowerCase()}`;
  
  try {
    // Try to get existing folder
    const children = await graphApiRequest(
      userId,
      `/me/drive/items/${parentFolderId}/children?$filter=name eq '${folderName}'`
    );
    
    if (children.value && children.value.length > 0) {
      return children.value[0];
    }
    
    // Create folder if it doesn't exist
    const newFolder = await graphApiRequest(
      userId,
      `/me/drive/items/${parentFolderId}/children`,
      {
        method: 'POST',
        body: JSON.stringify({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
        })
      }
    );
    
    return newFolder;
  } catch (error) {
    console.error('Error ensuring language folder:', error);
    throw error;
  }
}

/**
 * POST - Trigger dubbing for a video
 */
async function handlePost(userId, body) {
  const { videoId, languageCode } = body;
  
  if (!videoId || !languageCode) {
    throw new Error('videoId and languageCode are required');
  }
  
  const languageName = LANGUAGE_NAMES[languageCode];
  if (!languageName) {
    throw new Error(`Unsupported language code: ${languageCode}. Supported: de, fr, es, it, ja`);
  }
  
  // Get the original video
  const { data: video, error: videoError } = await supabase
    .from('product_videos')
    .select('*, sourced_products(asin)')
    .eq('id', videoId)
    .eq('user_id', userId)
    .single();
  
  if (videoError || !video) {
    throw new Error('Video not found or access denied');
  }
  
  // Check if variant already exists
  const { data: existingVariant } = await supabase
    .from('video_variants')
    .select('*')
    .eq('original_video_id', videoId)
    .eq('language_code', languageCode)
    .single();
  
  if (existingVariant) {
    if (existingVariant.dub_status === 'complete') {
      return { 
        variant: existingVariant, 
        message: 'Variant already exists',
        isExisting: true
      };
    }
    if (existingVariant.dub_status === 'processing') {
      return {
        variant: existingVariant,
        message: 'Dubbing already in progress',
        isExisting: true
      };
    }
    // If failed, allow retry by updating existing record
  }
  
  // Generate filename: {ASIN}_{Language}.ext
  const originalExt = video.filename.split('.').pop();
  const asin = video.sourced_products?.asin || video.filename.split('.')[0];
  const newFilename = `${asin}_${languageName}.${originalExt}`;
  
  // Create or update variant record
  const variantData = {
    original_video_id: videoId,
    language: languageName,
    language_code: languageCode,
    filename: newFilename,
    dub_status: 'processing',
    error_message: null,
    created_at: new Date().toISOString()
  };
  
  let variant;
  if (existingVariant) {
    const { data, error } = await supabase
      .from('video_variants')
      .update(variantData)
      .eq('id', existingVariant.id)
      .select()
      .single();
    if (error) throw new Error(`Failed to update variant: ${error.message}`);
    variant = data;
  } else {
    const { data, error } = await supabase
      .from('video_variants')
      .insert(variantData)
      .select()
      .single();
    if (error) throw new Error(`Failed to create variant: ${error.message}`);
    variant = data;
  }
  
  // Trigger the dubbing process asynchronously
  // Call the OneDrive-specific dubbing function
  // Note: This may timeout (Netlify 10s limit) - that's OK, user will use Check Status
  try {
    fetch(`${process.env.URL || 'https://dainty-horse-49c336.netlify.app'}/.netlify/functions/dub-onedrive-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        variantId: variant.id,
        videoId: videoId,
        targetLanguage: languageCode,
        userId: userId
      })
    }).catch(err => {
      // Fire and forget - don't wait for response
      console.log('Dub trigger sent (async):', err?.message || 'timeout expected');
    });
  } catch (dubError) {
    console.log('Dub trigger error (expected for timeout):', dubError.message);
    // Don't mark as failed - let user check status manually
  }
  
  return {
    variant,
    message: 'Dubbing started',
    isExisting: false
  };
}

/**
 * GET - Get variants for a video or specific variant
 */
async function handleGet(userId, videoId, variantId) {
  if (variantId) {
    // Get specific variant
    const { data: variant, error } = await supabase
      .from('video_variants')
      .select('*, product_videos!inner(user_id)')
      .eq('id', variantId)
      .single();
    
    if (error || !variant || variant.product_videos.user_id !== userId) {
      throw new Error('Variant not found or access denied');
    }
    
    return { variant };
  }
  
  if (videoId) {
    // Get all variants for a video
    const { data: variants, error } = await supabase
      .from('video_variants')
      .select('*')
      .eq('original_video_id', videoId)
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to fetch variants: ${error.message}`);
    }
    
    return { variants: variants || [] };
  }
  
  throw new Error('videoId or variantId required');
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return {
        statusCode: authResult.statusCode,
        headers,
        body: JSON.stringify({ error: authResult.error })
      };
    }

    const userId = authResult.userId;
    const params = event.queryStringParameters || {};
    
    // Parse path for variant ID
    const pathParts = event.path.split('/');
    const variantId = pathParts[pathParts.length - 1];
    const isVariantPath = variantId && variantId !== 'video-variants';

    let result;

    switch (event.httpMethod) {
      case 'GET':
        result = await handleGet(userId, params.videoId, isVariantPath ? variantId : null);
        break;

      case 'POST':
        const body = JSON.parse(event.body || '{}');
        result = await handlePost(userId, body);
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
    console.error('Video variants error:', error);
    
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
