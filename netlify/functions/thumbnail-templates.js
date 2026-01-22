/**
 * Thumbnail Templates - CRUD operations for thumbnail templates
 * 
 * GET    /thumbnail-templates - List user's templates (with signed URLs)
 * POST   /thumbnail-templates - Upload new template
 * PUT    /thumbnail-templates?id=xxx - Update template (zone)
 * DELETE /thumbnail-templates?id=xxx - Delete template and storage file
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
      // Join with crm_owners to get owner names
      const { data: templates, error: fetchError } = await supabase
        .from('thumbnail_templates')
        .select(`
          *,
          crm_owners (
            id,
            name
          )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (fetchError) {
        console.error('Error fetching templates:', fetchError);
        return errorResponse(500, 'Failed to fetch templates', headers);
      }

      // Generate signed URLs for each template
      const templatesWithUrls = await Promise.all(
        templates.map(async (template) => {
          let templateUrl = null;
          
          if (template.template_storage_path) {
            const { data: urlData } = await supabase.storage
              .from('thumbnail-templates')
              .createSignedUrl(template.template_storage_path, 60 * 60 * 24); // 24 hour expiry
            templateUrl = urlData?.signedUrl || null;
          }

          return {
            ...template,
            owner_name: template.crm_owners?.name || 'Unknown',
            template_url: templateUrl
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
      const { owner_id, template_image, placement_zone } = body;

      // Validation
      if (!owner_id || !template_image || !placement_zone) {
        return errorResponse(400, 'Missing required fields: owner_id, template_image, placement_zone', headers);
      }

      // Validate placement_zone structure
      if (placement_zone.x === undefined || placement_zone.y === undefined || 
          placement_zone.width === undefined || placement_zone.height === undefined) {
        return errorResponse(400, 'placement_zone must include x, y, width, height (as percentages)', headers);
      }

      // Verify owner exists and belongs to user
      const { data: owner, error: ownerError } = await supabase
        .from('crm_owners')
        .select('id, name')
        .eq('id', owner_id)
        .eq('user_id', userId)
        .single();

      if (ownerError || !owner) {
        return errorResponse(404, 'Owner not found', headers);
      }

      // Check for duplicate template for this owner
      const { data: existingTemplate } = await supabase
        .from('thumbnail_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('owner_id', owner_id)
        .single();

      if (existingTemplate) {
        return errorResponse(409, `Template for owner "${owner.name}" already exists`, headers);
      }

      // Decode base64 image
      let imageBuffer;
      try {
        const base64Data = template_image.replace(/^data:image\/\w+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
      } catch (error) {
        console.error('Base64 decode error:', error);
        return errorResponse(400, 'Invalid base64 image data', headers);
      }

      // Generate storage path
      const timestamp = Date.now();
      const safeName = owner.name.replace(/[^a-zA-Z0-9]/g, '_');
      const storagePath = `${userId}/${timestamp}_${safeName}.jpg`;

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
          owner_id,
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
          owner_name: owner.name,
          template_url: urlData?.signedUrl || null
        }
      }, headers, 201);
    }

    // ─────────────────────────────────────────────────────────
    // PUT - Update template (zone only - can't change owner)
    // ─────────────────────────────────────────────────────────
    if (method === 'PUT') {
      const id = event.queryStringParameters?.id;
      const body = JSON.parse(event.body || '{}');
      const { placement_zone, template_image } = body;

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
      if (placement_zone) updates.placement_zone = placement_zone;

      // Handle new image upload if provided
      if (template_image && template_image.startsWith('data:image')) {
        try {
          const base64Data = template_image.replace(/^data:image\/\w+;base64,/, '');
          const imageBuffer = Buffer.from(base64Data, 'base64');

          // Delete old image
          if (existingTemplate.template_storage_path) {
            await supabase.storage
              .from('thumbnail-templates')
              .remove([existingTemplate.template_storage_path]);
          }

          // Upload new image
          const timestamp = Date.now();
          const storagePath = `${userId}/${timestamp}_template.jpg`;
          
          const { error: uploadError } = await supabase.storage
            .from('thumbnail-templates')
            .upload(storagePath, imageBuffer, {
              contentType: 'image/jpeg',
              upsert: false
            });

          if (uploadError) throw uploadError;
          
          updates.template_storage_path = storagePath;
        } catch (error) {
          console.error('Image update error:', error);
          return errorResponse(500, 'Failed to update template image', headers);
        }
      }

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
      if (template.template_storage_path) {
        const { error: storageError } = await supabase.storage
          .from('thumbnail-templates')
          .remove([template.template_storage_path]);

        if (storageError) {
          console.error('Storage deletion error:', storageError);
          // Continue anyway - orphaned files are less critical than DB consistency
        }
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
