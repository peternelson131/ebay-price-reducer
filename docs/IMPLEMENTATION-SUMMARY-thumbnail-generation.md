# Auto-Thumbnail Generation - Implementation Summary

**Status:** Backend Complete ✅  
**Date:** 2026-01-22  
**Implemented By:** Backend Agent

---

## Overview

Successfully implemented backend infrastructure for auto-generating video thumbnails by compositing Amazon product images onto user-defined templates.

---

## What Was Implemented

### 1. Database Migration ✅
**File:** `supabase/migrations/20260122_thumbnail_templates.sql`

Created `thumbnail_templates` table:
- Links to `crm_owners` via `owner_id` (normalized, not text)
- Stores `template_storage_path` (Supabase Storage path)
- Stores `placement_zone` as JSONB percentages: `{x, y, width, height}`
- RLS policies for user isolation
- Indexes on user_id and owner_id

Added to `influencer_tasks`:
- `thumbnail_url TEXT` - URL to generated thumbnail
- `template_id UUID` - Reference to template used

### 2. Template CRUD API ✅
**File:** `netlify/functions/thumbnail-templates.js`

**Endpoints:**
- `GET /thumbnail-templates` - List user's templates with signed URLs
- `GET /thumbnail-templates/:id` - Get single template
- `POST /thumbnail-templates` - Upload template (base64 image + placement zone)
  - Validates owner exists
  - Prevents duplicate templates per owner
  - Uploads to `thumbnail-templates/` bucket
- `PUT /thumbnail-templates/:id` - Update owner or placement zone
- `DELETE /thumbnail-templates/:id` - Delete template + storage file

**Features:**
- JWT Bearer token authentication
- RLS enforcement (user_id validation)
- Signed URLs for template images (1-hour expiry)
- Owner validation from `crm_owners` table
- Placement zone validation

### 3. Thumbnail Generation Service ✅
**File:** `netlify/functions/utils/thumbnail-generator.js`

**Core Function:** `generateThumbnail({ templateId, asin, userId, productImageUrl })`

**Process:**
1. Fetches template from Supabase Storage
2. Downloads product image from Amazon URL (tries multiple patterns)
3. Resizes template to 1280x720 if needed
4. Calculates placement zone from percentages → pixels
5. Resizes product image to fit zone (maintains aspect ratio, transparent bg)
6. Composites product onto template using Sharp
7. Outputs JPEG quality 85
8. Uploads to `generated-thumbnails/` bucket
9. Returns signed URL (24-hour expiry)

**Helper Function:** `generateThumbnailForTask(taskId, userId)`
- Looks up task's owner
- Finds template for that owner
- Generates thumbnail
- Updates task with `thumbnail_url` + `template_id`

**Dependencies Added:**
- `sharp@^0.33.1` - Image processing library

### 4. Manual Generation Endpoint ✅
**File:** `netlify/functions/generate-thumbnail.js`

**Endpoint:** `POST /generate-thumbnail`

**Modes:**
1. `{ taskId }` - Generate for existing influencer task
2. `{ asin, ownerId }` - Generate for ASIN + owner combination

**Auth:**
- Supports JWT Bearer token (user auth)
- Supports webhook secret (for automation)

### 5. Auto-Generation Trigger ✅
**File:** `supabase/migrations/20260122_thumbnail_auto_generation_trigger.sql`

**Database Trigger:**
- `AFTER INSERT` on `influencer_tasks`
- Checks if task has ASIN + no thumbnail + status='pending'
- Calls `/generate-thumbnail` via HTTP webhook (pg_net extension)
- Falls back gracefully if webhook not configured

**Configuration Required:**
```sql
ALTER DATABASE postgres SET app.thumbnail_webhook_url = 'https://your-site.netlify.app/.netlify/functions/generate-thumbnail';
ALTER DATABASE postgres SET app.webhook_secret = 'your-webhook-secret';
```

**Alternative:** Logging-only version if pg_net not available

---

## Storage Buckets

### `thumbnail-templates/`
- **Purpose:** User-uploaded base templates
- **Structure:** `{userId}/{ownerId}_{timestamp}.jpg`
- **Access:** Private (RLS via Supabase)

### `generated-thumbnails/`
- **Purpose:** Auto-generated thumbnails
- **Structure:** `{userId}/{asin}_{timestamp}.jpg`
- **Access:** Private (RLS via Supabase)

---

## API Reference

### 1. List Templates
```bash
GET /thumbnail-templates
Authorization: Bearer <token>

Response:
{
  "success": true,
  "templates": [
    {
      "id": "uuid",
      "owner_id": "uuid",
      "owner": { "id": "uuid", "name": "Pete" },
      "template_storage_path": "userId/ownerId_timestamp.jpg",
      "template_url": "https://...",  // Signed URL
      "placement_zone": { "x": 5, "y": 15, "width": 35, "height": 60 },
      "created_at": "2026-01-22T...",
      "updated_at": "2026-01-22T..."
    }
  ]
}
```

### 2. Create Template
```bash
POST /thumbnail-templates
Authorization: Bearer <token>
Content-Type: application/json

{
  "ownerId": "uuid",
  "placementZone": { "x": 5, "y": 15, "width": 35, "height": 60 },
  "templateFile": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
}

Response:
{
  "success": true,
  "template": { ... },
  "message": "Template created successfully"
}
```

### 3. Update Template
```bash
PUT /thumbnail-templates/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "ownerId": "new-uuid",  // Optional
  "placementZone": { "x": 10, "y": 20, "width": 40, "height": 50 }  // Optional
}

Response:
{
  "success": true,
  "template": { ... },
  "message": "Template updated successfully"
}
```

### 4. Delete Template
```bash
DELETE /thumbnail-templates/:id
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Template deleted successfully"
}
```

### 5. Generate Thumbnail (Manual)
```bash
POST /generate-thumbnail
Authorization: Bearer <token>
Content-Type: application/json

# Mode 1: By task ID
{
  "taskId": "uuid"
}

# Mode 2: By ASIN + owner
{
  "asin": "B0ABCDEF12",
  "ownerId": "uuid"
}

Response:
{
  "success": true,
  "thumbnailUrl": "https://...",  // Signed URL
  "storagePath": "userId/asin_timestamp.jpg",  // Only in mode 2
  "message": "Thumbnail generated successfully"
}
```

---

## Testing Guide

### 1. Test Template Upload
```bash
# Get auth token (use Supabase dashboard or auth-login function)
TOKEN="your-jwt-token"

# Create owner first (use CRM UI or direct DB insert)
OWNER_ID="uuid-of-crm-owner"

# Upload template
curl -X POST https://your-site.netlify.app/.netlify/functions/thumbnail-templates \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ownerId": "'$OWNER_ID'",
    "placementZone": {"x": 10, "y": 15, "width": 30, "height": 50},
    "templateFile": "data:image/jpeg;base64,/9j/4AAQ..."
  }'
```

### 2. Test Manual Generation
```bash
# Generate thumbnail for task
curl -X POST https://your-site.netlify.app/.netlify/functions/generate-thumbnail \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "taskId": "task-uuid"
  }'
```

### 3. Test Auto-Generation
```sql
-- Insert influencer task (should trigger auto-generation)
INSERT INTO influencer_tasks (user_id, asin, owner_id, status)
VALUES ('user-uuid', 'B0ABCDEF12', 'owner-uuid', 'pending');

-- Check if thumbnail was generated
SELECT thumbnail_url, template_id FROM influencer_tasks WHERE id = 'task-uuid';
```

---

## Known Limitations & Next Steps

### Limitations
1. **Product Image URLs:** Currently tries common Amazon URL patterns. May need fallback to Keepa API if image not found.
2. **pg_net Required:** Auto-generation trigger requires `pg_net` extension. Falls back to logging if not available.
3. **Synchronous Generation:** Webhook approach is async but may timeout on slow connections. Consider background job queue for production.

### Next Steps (Frontend)
1. **Template Management UI** (Task 2.1-2.3)
   - Template list in Settings
   - Upload modal with drag & drop
   - Visual zone editor with rectangle drawing
   - Preview with sample product

2. **Chrome Extension Integration** (Task 3.1-3.2)
   - Download button for video + thumbnail
   - Thumbnail preview in task card

3. **Testing & Polish** (Task 4.1)
   - End-to-end testing
   - Performance optimization
   - Error handling improvements

---

## Files Created/Modified

### Created
- `netlify/functions/thumbnail-templates.js` - CRUD API
- `netlify/functions/generate-thumbnail.js` - Manual generation endpoint
- `netlify/functions/utils/thumbnail-generator.js` - Sharp service
- `supabase/migrations/20260122_thumbnail_templates.sql` - Database schema
- `supabase/migrations/20260122_thumbnail_auto_generation_trigger.sql` - Auto-generation trigger
- `docs/IMPLEMENTATION-SUMMARY-thumbnail-generation.md` - This file

### Modified
- `netlify/functions/package.json` - Added `sharp@^0.33.1`

---

## Deployment Checklist

- [ ] Apply database migrations to production Supabase
- [ ] Install npm dependencies (`npm install` in netlify/functions)
- [ ] Deploy Netlify functions
- [ ] Enable pg_net extension in Supabase (if using auto-generation)
- [ ] Configure webhook URL and secret in Supabase
- [ ] Create storage buckets in Supabase (if not auto-created):
  - `thumbnail-templates` (private)
  - `generated-thumbnails` (private)
- [ ] Test template upload
- [ ] Test manual generation
- [ ] Test auto-generation
- [ ] Monitor logs for errors

---

## Architecture Diagram

```
User Upload Template
       ↓
POST /thumbnail-templates
       ↓
Validate Owner → Upload to Storage → Create DB Record
       ↓
Template Stored
       
       
Influencer Task Created
       ↓
Database Trigger (AFTER INSERT)
       ↓
HTTP Webhook → POST /generate-thumbnail
       ↓
generateThumbnailForTask()
       ↓
1. Fetch template from storage
2. Download product image from Amazon
3. Composite with Sharp (1280x720 JPEG)
4. Upload to generated-thumbnails/
5. Update task.thumbnail_url
       ↓
Thumbnail Ready for Download
```

---

**Implementation Complete:** Backend infrastructure is ready for frontend integration! 🚀
