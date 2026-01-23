/**
 * Thumbnail Templates - Manage user-uploaded base templates for auto-thumbnail generation
 * 
 * GET /thumbnail-templates - List user's templates
 * GET /thumbnail-templates/:id - Get single template
 * POST /thumbnail-templates - Create new template (upload)
 * PUT /thumbnail-templates/:id - Update template (zone, owner)
 * DELETE /thumbnail-templates/:id - Delete template
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
    // Verify authentication
    const authResult = await verifyAuth(event);
    if (!authResult.success) {
      return errorResponse(authResult.statusCode, authResult.error, headers);
    }
    
    const userId = authResult.userId;

    // GET - List templates or get single template
    if (event.httpMethod === 'GET') {
      const pathMatch = event.path.match(/\/([^\/]+)$/);
      const templateId = pathMatch && pathMatch[1] !== 'thumbnail-templates' ? pathMatch[1] : null;

      if (templateId) {
        // Get single template
        const { data: template, error } = await supabase
          .from('thumbnail_templates')
          .select(`
            *,
            owner:crm_owners(id, name)
          `)
          .eq('id', templateId)
          .eq('user_id', userId)
          .single();

        if (error) {
          console.error('Failed to fetch template:', error);
          return errorResponse(404, 'Template not found', headers);
        }

        // Generate signed URL for template image
        const { data: signedData, error: signedError } = await supabase.storage
          .from('thumbnail-templates')
          .createSignedUrl(template.template_storage_path, 3600); // 1 hour

        if (!signedError && signedData?.signedUrl) {
          template.template_url = signedData.signedUrl;
        }

        return successResponse({
          success: true,
          template
        }, headers);
      } else {
        // List all templates
        const { data: templates, error } = await supabase
          .from('thumbnail_templates')
          .select(`
            *,
            owner:crm_owners(id, name)
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Failed to fetch templates:', error);
          return errorResponse(500, 'Failed to fetch templates', headers);
        }

        // Generate signed URLs for all template images
        const templatesWithUrls = await Promise.all((templates || []).map(async (template) => {
          const { data: signedData, error: signedError } = await supabase.storage
            .from('thumbnail-templates')
            .createSignedUrl(template.template_storage_path, 3600);

          if (!signedError && signedData?.signedUrl) {
            template.template_url = signedData.signedUrl;
          }
          return template;
        }));

        return successResponse({
          success: true,
          templates: templatesWithUrls
        }, headers);
      }
    }

    // POST - Create new template
    if (event.httpMethod === 'POST') {
      const { 
        ownerId, 
        placementZone, 
        templateFile // Base64-encoded image data
      } = JSON.parse(event.body || '{}');

      if (!ownerId || !placementZone || !templateFile) {
        return errorResponse(400, 'ownerId, placementZone, and templateFile required', headers);
      }

      // Validate placement zone format
      if (!placementZone.x || !placementZone.y || !placementZone.width || !placementZone.height) {
        return errorResponse(400, 'placementZone must contain x, y, width, height', headers);
      }

      // Verify owner belongs to user
      const { data: owner, error: ownerError } = await supabase
        .from('crm_owners')
        .select('id, name')
        .eq('id', ownerId)
        .eq('user_id', userId)
        .single();

      if (ownerError || !owner) {
        return errorResponse(404, 'Owner not found', headers);
      }

      // Check if template already exists for this owner
      const { data: existing } = await supabase
        .from('thumbnail_templates')
        .select('id')
        .eq('user_id', userId)
        .eq('owner_id', ownerId)
        .single();

      if (existing) {
        return errorResponse(409, 'Template already exists for this owner', headers);
      }

      // Upload template image to Supabase Storage
      const fileName = `${userId}/${ownerId}_${Date.now()}.jpg`;
      const buffer = Buffer.from(templateFile.replace(/^data:image\/\w+;base64,/, ''), 'base64');
      
      const { error: uploadError } = await supabase.storage
        .from('thumbnail-templates')
        .upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Failed to upload template:', uploadError);
        return errorResponse(500, 'Failed to upload template image', headers);
      }

      // Create database record
      const { data: template, error: insertError } = await supabase
        .from('thumbnail_templates')
        .insert({
          user_id: userId,
          owner_id: ownerId,
          template_storage_path: fileName,
          placement_zone: placementZone
        })
        .select(`
          *,
          owner:crm_owners(id, name)
        `)
        .single();

      if (insertError) {
        console.error('Failed to create template:', insertError);
        // Clean up uploaded file
        await supabase.storage
          .from('thumbnail-templates')
          .remove([fileName]);
        return errorResponse(500, 'Failed to create template', headers);
      }

      // Generate signed URL
      const { data: signedData } = await supabase.storage
        .from('thumbnail-templates')
        .createSignedUrl(fileName, 3600);

      if (signedData?.signedUrl) {
        template.template_url = signedData.signedUrl;
      }

      return successResponse({
        success: true,
        template,
        message: 'Template created successfully'
      }, headers, 201);
    }

    // PUT - Update template
    if (event.httpMethod === 'PUT') {
      const pathMatch = event.path.match(/\/([^\/]+)$/);
      const templateId = pathMatch && pathMatch[1] !== 'thumbnail-templates' ? pathMatch[1] : null;

      if (!templateId) {
        return errorResponse(400, 'Template ID required', headers);
      }

      const { ownerId, placementZone } = JSON.parse(event.body || '{}');

      if (!ownerId && !placementZone) {
        return errorResponse(400, 'ownerId or placementZone required', headers);
      }

      // Verify template belongs to user
      const { data: existingTemplate } = await supabase
        .from('thumbnail_templates')
        .select('id, owner_id')
        .eq('id', templateId)
        .eq('user_id', userId)
        .single();

      if (!existingTemplate) {
        return errorResponse(404, 'Template not found', headers);
      }

      const updates = {};
      
      if (ownerId) {
        // Verify new owner belongs to user
        const { data: owner, error: ownerError } = await supabase
          .from('crm_owners')
          .select('id')
          .eq('id', ownerId)
          .eq('user_id', userId)
          .single();

        if (ownerError || !owner) {
          return errorResponse(404, 'Owner not found', headers);
        }

        // Check for conflicts if changing owner
        if (ownerId !== existingTemplate.owner_id) {
          const { data: conflict } = await supabase
            .from('thumbnail_templates')
            .select('id')
            .eq('user_id', userId)
            .eq('owner_id', ownerId)
            .neq('id', templateId)
            .single();

          if (conflict) {
            return errorResponse(409, 'Another template already exists for this owner', headers);
          }
        }

        updates.owner_id = ownerId;
      }

      if (placementZone) {
        // Validate placement zone format
        if (!placementZone.x || !placementZone.y || !placementZone.width || !placementZone.height) {
          return errorResponse(400, 'placementZone must contain x, y, width, height', headers);
        }
        updates.placement_zone = placementZone;
      }

      updates.updated_at = new Date().toISOString();

      // Update template
      const { data: template, error: updateError } = await supabase
        .from('thumbnail_templates')
        .update(updates)
        .eq('id', templateId)
        .eq('user_id', userId)
        .select(`
          *,
          owner:crm_owners(id, name)
        `)
        .single();

      if (updateError) {
        console.error('Failed to update template:', updateError);
        return errorResponse(500, 'Failed to update template', headers);
      }

      // Generate signed URL
      const { data: signedData } = await supabase.storage
        .from('thumbnail-templates')
        .createSignedUrl(template.template_storage_path, 3600);

      if (signedData?.signedUrl) {
        template.template_url = signedData.signedUrl;
      }

      return successResponse({
        success: true,
        template,
        message: 'Template updated successfully'
      }, headers);
    }

    // DELETE - Delete template
    if (event.httpMethod === 'DELETE') {
      const pathMatch = event.path.match(/\/([^\/]+)$/);
      const templateId = pathMatch && pathMatch[1] !== 'thumbnail-templates' ? pathMatch[1] : null;

      if (!templateId) {
        return errorResponse(400, 'Template ID required', headers);
      }

      // Get template to verify ownership and get storage path
      const { data: template, error: fetchError } = await supabase
        .from('thumbnail_templates')
        .select('template_storage_path')
        .eq('id', templateId)
        .eq('user_id', userId)
        .single();

      if (fetchError || !template) {
        return errorResponse(404, 'Template not found', headers);
      }

      // Delete from database first
      const { error: deleteError } = await supabase
        .from('thumbnail_templates')
        .delete()
        .eq('id', templateId)
        .eq('user_id', userId);

      if (deleteError) {
        console.error('Failed to delete template:', deleteError);
        return errorResponse(500, 'Failed to delete template', headers);
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('thumbnail-templates')
        .remove([template.template_storage_path]);

      if (storageError) {
        console.error('Failed to delete template file:', storageError);
        // Don't fail the request - database record is already deleted
      }

      return successResponse({
        success: true,
        message: 'Template deleted successfully'
      }, headers);
    }

    return errorResponse(405, 'Method not allowed', headers);

  } catch (error) {
    console.error('Error in thumbnail-templates:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
