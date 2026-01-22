/**
 * Thumbnail Templates - CRUD operations for thumbnail templates
 * 
 * GET    /thumbnail-templates - List user's templates (with signed URLs)
 * POST   /thumbnail-templates - Upload new template
 * PUT    /thumbnail-templates/:id - Update template (zone, owner_name)
 * DELETE /thumbnail-templates/:id - Delete template and storage file
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const headers = getCorsHeaders(event);

  // Handle CORS preflight
  const preflight = handlePreflight(event);
  if (preflight) return preflight;

  try {
    // ─────────────────────────────────────────────────────────
    // SECURITY: Verify authentication
    // ─────────────────────────────────────────────────────────
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;
    const method = event.httpMethod;

    // ─────────────────────────────────────────────────────────
    // GET - List user's templates
    // ─────────────────────────────────────────────────────────
    if (method === 'GET') {
      const { data: templates, error: fetchError } = await supabase
        .from('thumbnail_templates')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching templates:', fetchError);
        return errorResponse(500, 'Failed to fetch templates', headers);
      }

      // Generate signed URLs for each template
      const templatesWithUrls = await Promise.all(
        templates.map(async (template) => {
          const { data: urlData } = await supabase.storage
            .from('thumbnail-templates')
            .createSignedUrl(template.template_storage_path, 60 * 60 * 24); // 24 hour expiry

          return {
            ...template,
            template_url: urlData?.signedUrl || null
          };
        })
      );

      return successResponse({
        success: true,
        templates: templatesWithUrls
      }, headers);
    }

    // ─────────────────────────────────────────────────────────
    // POST - Upload new template
    // ─────────────────────────────────────────────────────────
    if (method === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const { owner_name, image_base64, placement_zone } = body;

      // Validation
      if (!owner_name || !image_base64 || !placement_zone) {
        return errorResponse(400, 'Missing required fields: owner_name, image_base64, placement_zone', headers);
      }

      // Validate placement_zone structure
      if (!placement_zone.x || !placement_zone.y || !placement_zone.width || !placement_zone.height) {
        return errorResponse(400, 'placement_zone must include x, y, width, height (as percentages)', headers);
      }

      // Check for duplicate owner_name
      const { data: existingTemplate } = await supabase
        .from('thumbnail_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('owner_name', owner_name)
        .single();

      if (existingTemplate) {
        return errorResponse(409, `Template for owner "${owner_name}" already exists`, headers);
      }

      // Decode base64 image
      let imageBuffer;
      try {
        const base64Data = image_base64.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch (error) {
        console.error('Base64 decode error:', error);
        return errorResponse(400, 'Invalid base64 image data', headers);
      }

      // Generate storage path
      const timestamp = Date.now();
      const storagePath = `${userId}/${timestamp}_${owner_name.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('thumbnail-templates')
        .upload(storagePath, imageBuffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return errorResponse(500, `Failed to upload template: ${uploadError.message}`, headers);
      }

      // Insert template record
      const { data: newTemplate, error: insertError } = await supabase
        .from('thumbnail_templates')
        .insert({
          user_id: userId,
          owner_name,
          template_storage_path: storagePath,
          placement_zone
        })
        .select()
        .single();

      if (insertError) {
        console.error('Database insert error:', insertError);
        
        // Clean up uploaded file
        await supabase.storage
          .from('thumbnail-templates')
          .remove([storagePath]);
        
        return errorResponse(500, `Failed to create template: ${insertError.message}`, headers);
      }

      // Get signed URL for response
      const { data: urlData } = await supabase.storage
        .from('thumbnail-templates')
        .createSignedUrl(storagePath, 60 * 60 * 24);

      return successResponse({
        success: true,
        template: {
          ...newTemplate,
          template_url: urlData?.signedUrl || null
        }
      }, headers, 201);
    }

    // ─────────────────────────────────────────────────────────
    // PUT - Update template (zone and/or owner_name)
    // ─────────────────────────────────────────────────────────
    if (method === 'PUT') {
      const body = JSON.parse(event.body || '{}');
      const { id, owner_name, placement_zone } = body;

      if (!id) {
        return errorResponse(400, 'Missing template id', headers);
      }

      // Verify ownership
      const { data: existingTemplate, error: fetchError } = await supabase
        .from('thumbnail_templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError || !existingTemplate) {
        return errorResponse(404, 'Template not found', headers);
      }

      // Build update object
      const updates = { updated_at: new Date().toISOString() };
      if (owner_name) updates.owner_name = owner_name;
      if (placement_zone) updates.placement_zone = placement_zone;

      // Update template
      const { data: updatedTemplate, error: updateError } = await supabase
        .from('thumbnail_templates')
        .update(updates)
        .eq('id', id)
        .eq('user_id', userId)
        .select()
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return errorResponse(500, `Failed to update template: ${updateError.message}`, headers);
      }

      // Get signed URL for response
      const { data: urlData } = await supabase.storage
        .from('thumbnail-templates')
        .createSignedUrl(updatedTemplate.template_storage_path, 60 * 60 * 24);

      return successResponse({
        success: true,
        template: {
          ...updatedTemplate,
          template_url: urlData?.signedUrl || null
        }
      }, headers);
    }

    // ─────────────────────────────────────────────────────────
    // DELETE - Remove template and storage file
    // ─────────────────────────────────────────────────────────
    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;

      if (!id) {
        return errorResponse(400, 'Missing template id', headers);
      }

      // Verify ownership and get storage path
      const { data: template, error: fetchError } = await supabase
        .from('thumbnail_templates')
        .select('*')
        .eq('id', id)
        .eq('user_id', userId)
        .single();

      if (fetchError || !template) {
        return errorResponse(404, 'Template not found', headers);
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('thumbnail-templates')
        .remove([template.template_storage_path]);

      if (storageError) {
        console.error('Storage deletion error:', storageError);
        // Continue anyway - orphaned files are less critical than DB consistency
      }

      // Delete from database
      const { error: deleteError } = await supabase
        .from('thumbnail_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Database deletion error:', deleteError);
        return errorResponse(500, `Failed to delete template: ${deleteError.message}`, headers);
      }

      return successResponse({
        success: true,
        message: 'Template deleted successfully'
      }, headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Thumbnail templates error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
