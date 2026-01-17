/**
 * Submit Feedback API
 * Handles user feedback submission with optional screenshot upload
 * 
 * POST /submit-feedback
 * - Accept multipart form data (category, description, screenshot file)
 * - Upload screenshot to storage bucket if provided
 * - Insert feedback record into database
 * - Returns success/error response
 * - Requires screenshot for 'bug' category
 */

const { createClient } = require('@supabase/supabase-js');
const Busboy = require('busboy');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Valid feedback categories
const VALID_CATEGORIES = ['feature_request', 'bug', 'other'];

// Max file size: 5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Parse multipart form data from the request
 * @param {Object} event - Netlify function event
 * @returns {Promise<Object>} - { fields, file }
 */
function parseMultipartForm(event) {
  return new Promise((resolve, reject) => {
    const contentType = event.headers['content-type'] || event.headers['Content-Type'];
    
    if (!contentType || !contentType.includes('multipart/form-data')) {
      // Try parsing as JSON for non-file submissions
      try {
        const body = JSON.parse(event.body);
        resolve({ fields: body, file: null });
        return;
      } catch (e) {
        reject(new Error('Invalid content type. Expected multipart/form-data or application/json'));
        return;
      }
    }

    const busboy = Busboy({ 
      headers: { 'content-type': contentType },
      limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1
      }
    });
    
    const fields = {};
    let file = null;
    let fileBuffer = [];
    let fileTruncated = false;

    busboy.on('field', (fieldname, value) => {
      fields[fieldname] = value;
    });

    busboy.on('file', (fieldname, fileStream, info) => {
      const { filename, mimeType } = info;
      
      if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        fileStream.resume(); // Drain the stream
        reject(new Error(`Invalid file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`));
        return;
      }

      file = {
        fieldname,
        filename,
        mimeType,
        buffer: null
      };

      fileStream.on('data', (data) => {
        fileBuffer.push(data);
      });

      fileStream.on('limit', () => {
        fileTruncated = true;
      });

      fileStream.on('end', () => {
        if (!fileTruncated) {
          file.buffer = Buffer.concat(fileBuffer);
        }
      });
    });

    busboy.on('finish', () => {
      if (fileTruncated) {
        reject(new Error(`File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`));
        return;
      }
      resolve({ fields, file });
    });

    busboy.on('error', (err) => {
      reject(err);
    });

    // Handle base64 encoded body (Netlify sometimes encodes it)
    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body);
    
    busboy.end(bodyBuffer);
  });
}

/**
 * Upload screenshot to Supabase storage
 * @param {Object} supabase - Supabase client
 * @param {string} userId - User ID
 * @param {Object} file - File object with buffer, filename, mimeType
 * @returns {Promise<string>} - Public URL of the uploaded file
 */
async function uploadScreenshot(supabase, userId, file) {
  // Generate unique filename with timestamp
  const timestamp = Date.now();
  const extension = file.filename.split('.').pop() || 'png';
  const filename = `${timestamp}-screenshot.${extension}`;
  const filePath = `${userId}/${filename}`;

  const { data, error } = await supabase.storage
    .from('feedback-screenshots')
    .upload(filePath, file.buffer, {
      contentType: file.mimeType,
      upsert: false
    });

  if (error) {
    console.error('Storage upload error:', error);
    throw new Error(`Failed to upload screenshot: ${error.message}`);
  }

  // Get the URL for the uploaded file
  // Since the bucket is private, we'll store the path and generate signed URLs when needed
  // For now, return the path that can be used with createSignedUrl later
  return filePath;
}

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle preflight
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }

  const userId = authResult.userId;

  try {
    // Parse the request body
    const { fields, file } = await parseMultipartForm(event);

    const { category, description } = fields;

    // Validate required fields
    if (!category) {
      return errorResponse(400, 'Category is required', headers);
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return errorResponse(400, `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`, headers);
    }

    if (!description || description.trim().length === 0) {
      return errorResponse(400, 'Description is required', headers);
    }

    // Validate: bug reports require a screenshot
    if (category === 'bug' && !file) {
      return errorResponse(400, 'Screenshot is required for bug reports', headers);
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Upload screenshot if provided
    let screenshotUrl = null;
    if (file && file.buffer) {
      screenshotUrl = await uploadScreenshot(supabase, userId, file);
      console.log(`Screenshot uploaded: ${screenshotUrl}`);
    }

    // Insert feedback record
    const { data: feedbackData, error: insertError } = await supabase
      .from('feedback')
      .insert({
        user_id: userId,
        category,
        description: description.trim(),
        screenshot_url: screenshotUrl
      })
      .select()
      .single();

    if (insertError) {
      console.error('Database insert error:', insertError);
      throw new Error(`Failed to save feedback: ${insertError.message}`);
    }

    console.log(`Feedback submitted: ${feedbackData.id} by user ${userId}`);

    return successResponse({
      success: true,
      message: 'Feedback submitted successfully',
      feedback: {
        id: feedbackData.id,
        category: feedbackData.category,
        description: feedbackData.description,
        hasScreenshot: !!screenshotUrl,
        createdAt: feedbackData.created_at
      }
    }, headers, 201);

  } catch (err) {
    console.error('Submit feedback error:', err);
    return errorResponse(500, err.message || 'Internal server error', headers);
  }
};
