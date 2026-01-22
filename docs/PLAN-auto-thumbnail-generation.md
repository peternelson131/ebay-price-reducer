# Auto-Thumbnail Generation - Implementation Plan

**Feature:** Auto-generate thumbnails by compositing Keepa product images onto user-defined templates  
**Analysis:** `docs/analysis/auto-thumbnail-generation-analysis.md`  
**Status:** Ready for Implementation

---

## Overview

Users upload base thumbnail templates (one per CRM owner), define a "landing zone" for the product image via a visual editor, and the system auto-generates thumbnails when an owner is assigned to a product in the CRM.

## Key Design Decisions (Updated)

1. **Owner = CRM Owner** - Dropdown from `crm_owners` table, not free text
2. **Trigger = Owner assignment in CRM** - Not task creation
3. **Storage = OneDrive** - User's connected OneDrive, not Supabase Storage
4. **No UI display needed** - Just store for download later

---

## Tasks

### Phase 1: Database & Backend Foundation

#### Task 1.1: Database Migration
**Agent:** Backend  
**Description:** Create `thumbnail_templates` table and add columns to `influencer_tasks`

```sql
-- thumbnail_templates table
CREATE TABLE thumbnail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  owner_name TEXT NOT NULL,
  template_storage_path TEXT NOT NULL,  -- Supabase Storage path
  placement_zone JSONB NOT NULL,  -- {x, y, width, height} as percentages
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, owner_name)
);

-- Add to influencer_tasks
ALTER TABLE influencer_tasks 
  ADD COLUMN thumbnail_url TEXT,
  ADD COLUMN template_id UUID REFERENCES thumbnail_templates(id);
```

**Acceptance Criteria:**
- [ ] Migration runs successfully
- [ ] RLS policies allow users to manage their own templates
- [ ] Indexes on user_id and owner_name

---

#### Task 1.2: Template Upload API
**Agent:** Backend  
**Description:** Create endpoints for template CRUD operations

**Endpoints:**
- `POST /api/thumbnail-templates` - Upload new template
- `GET /api/thumbnail-templates` - List user's templates
- `PUT /api/thumbnail-templates/:id` - Update template (zone, name)
- `DELETE /api/thumbnail-templates/:id` - Delete template

**Acceptance Criteria:**
- [ ] Template image uploads to Supabase Storage
- [ ] Placement zone stored as JSON
- [ ] Returns template list with signed URLs for display

---

#### Task 1.3: Thumbnail Generation Service
**Agent:** Backend  
**Description:** Implement Sharp-based image compositing

**Logic:**
1. Fetch template image from Supabase Storage
2. Fetch product image from Keepa/Amazon URL
3. Resize product image to fit placement zone
4. Composite product onto template
5. Save to Supabase Storage
6. Update influencer_task with thumbnail_url

**Acceptance Criteria:**
- [ ] Generates 1280x720 JPEG thumbnails
- [ ] Product image scales to fit zone proportionally
- [ ] Handles missing product images gracefully
- [ ] Returns signed URL for generated thumbnail

---

#### Task 1.4: Auto-Generation on Task Creation
**Agent:** Backend  
**Description:** Hook thumbnail generation into task creation flow

**Logic:**
- When influencer_task is created with an ASIN
- Look up user's templates
- If template exists for the owner, trigger generation
- Store thumbnail_url on the task

**Acceptance Criteria:**
- [ ] Thumbnail generated automatically when task created
- [ ] Works with existing task creation flow
- [ ] Graceful fallback if no template or no product image

---

### Phase 2: Frontend - Template Management

#### Task 2.1: Template Settings Page
**Agent:** Frontend  
**Description:** Add "Thumbnail Templates" section to Settings

**UI Components:**
- Template list showing owner name + preview
- "Add Template" button
- Edit/Delete actions per template

**Acceptance Criteria:**
- [ ] Lists all user's templates
- [ ] Shows template preview thumbnail
- [ ] Delete with confirmation

---

#### Task 2.2: Template Upload Modal
**Agent:** Frontend  
**Description:** Modal for uploading new template

**Fields:**
- Owner name (text input or select from existing)
- Template image upload (drag & drop)
- Image preview after upload

**Acceptance Criteria:**
- [ ] Drag-and-drop file upload
- [ ] Image preview before saving
- [ ] Validation for image format (PNG, JPG)

---

#### Task 2.3: Zone Editor Component
**Agent:** Frontend  
**Description:** Visual editor for defining product placement zone

**Features:**
- Display uploaded template at full width
- Click and drag to draw rectangle
- Rectangle shows as overlay with handles
- Can resize/reposition rectangle
- Shows coordinates in real-time
- "Preview with sample product" button

**Acceptance Criteria:**
- [ ] Draw rectangle by clicking and dragging
- [ ] Resize rectangle with corner handles
- [ ] Move rectangle by dragging center
- [ ] Save stores zone as `{x, y, width, height}` (percentage-based)
- [ ] Preview shows sample product in zone

---

### Phase 3: Chrome Extension Update

#### Task 3.1: Thumbnail Download Integration
**Agent:** Frontend  
**Description:** Update Chrome extension to download video + thumbnail together

**Changes:**
- Rename download button to "Download All"
- Fetch both video URL and thumbnail URL
- Download both files sequentially
- Show progress for each file

**Acceptance Criteria:**
- [ ] Single button downloads both files
- [ ] Video downloads as original filename
- [ ] Thumbnail downloads as `{asin}_thumbnail.jpg`
- [ ] Graceful handling if no thumbnail available

---

#### Task 3.2: Thumbnail Preview in Extension
**Agent:** Frontend  
**Description:** Show thumbnail preview in task card

**Changes:**
- Small thumbnail preview image in task card
- Click to enlarge
- "No thumbnail" indicator if not available

**Acceptance Criteria:**
- [ ] Thumbnail preview visible in task card
- [ ] Lazy loading for performance
- [ ] Fallback placeholder if no thumbnail

---

### Phase 4: Testing & Polish

#### Task 4.1: End-to-End Testing
**Agent:** QA  
**Description:** Test complete workflow

**Test Cases:**
1. Upload template with zone defined
2. Create influencer task
3. Verify thumbnail auto-generated
4. Download from Chrome extension
5. Verify thumbnail has product composited correctly

**Acceptance Criteria:**
- [ ] All test cases pass
- [ ] No console errors
- [ ] Performance acceptable (<5s for generation)

---

## Dependencies

```
Task 1.1 (DB) 
    ↓
Task 1.2 (API) → Task 2.1 (Settings Page)
    ↓                    ↓
Task 1.3 (Generation) ← Task 2.2 (Upload Modal)
    ↓                    ↓
Task 1.4 (Auto-gen)    Task 2.3 (Zone Editor)
    ↓
Task 3.1 (Extension Download)
    ↓
Task 3.2 (Extension Preview)
    ↓
Task 4.1 (Testing)
```

---

## Technical Notes

### Placement Zone Format
Store as percentages for responsive scaling:
```json
{
  "x": 5,       // 5% from left
  "y": 15,      // 15% from top  
  "width": 35,  // 35% of template width
  "height": 60  // 60% of template height
}
```

### Image Processing Pipeline
1. Template: Load from Supabase Storage
2. Product: Fetch from `https://m.media-amazon.com/images/I/{code}._SL1000_.jpg`
3. Composite: Sharp `.composite([{input, left, top}])`
4. Output: JPEG quality 85, 1280x720

### Supabase Storage Buckets
- `thumbnail-templates/` - Base templates (user uploads)
- `generated-thumbnails/` - Auto-generated thumbnails

---

## Estimated Effort

| Phase | Tasks | Effort |
|-------|-------|--------|
| Phase 1: Backend | 4 tasks | 2-3 days |
| Phase 2: Frontend | 3 tasks | 2-3 days |
| Phase 3: Extension | 2 tasks | 1 day |
| Phase 4: Testing | 1 task | 1 day |
| **Total** | **10 tasks** | **~6-8 days** |

---

*Plan created: 2026-01-21*  
*Status: Ready for Implementation*
