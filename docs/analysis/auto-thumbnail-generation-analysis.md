# Auto-Thumbnail Generation - Feature Analysis

## Executive Summary

Create an automated thumbnail generation system that composites product images from Keepa onto user-defined base templates, associating each template with an "owner" (influencer). Generated thumbnails would be linked to influencer tasks and downloadable alongside videos in the Chrome extension.

## Problem Statement

**Current Pain:** Pete manually creates thumbnails for each video upload - this is time-consuming and repetitive.

**Desired Outcome:** 
- Upload a base thumbnail template per owner/influencer (e.g., "Peter's template")
- Automatically composite the Keepa product image onto the template when tasks are created
- Download both video AND thumbnail from the Chrome extension

## Current State

### What We Have:
1. **Keepa Integration** - Already fetches product images via `m.media-amazon.com` URLs
2. **OneDrive Integration** - For video storage/download
3. **Influencer Tasks** - Tracks ASINs with `video_id` references
4. **Chrome Extension** - Side panel with download capability

### Example Template (from Pete):
- Person (owner) on right side of image
- Product placeholder area on left (white/gray box)
- "WATCH BEFORE YOU BUY" text overlay
- Orange arrow pointing from product to person
- ~1280x720 typical YouTube thumbnail dimensions

---

## Proposed Approaches

### Option A: Simple Fixed-Position Overlay
**Description:** Store template with fixed coordinates for product placement. Backend composites image at that position.

**Pros:**
- Simplest to implement
- Fast processing
- Easy to understand

**Cons:**
- Limited flexibility - one position per template
- User can't adjust without re-uploading

**Effort:** Small (S)
**Risk:** Low

### Option B: Template with Metadata Zones ⭐ SELECTED
**Description:** User uploads template + defines a "placement zone" by drawing a rectangle on the image. Backend scales product image to fit zone and composites.

**Zone Editor UX:**
1. User uploads template image
2. Template displays in preview
3. User clicks and drags to draw a rectangle where product should go
4. Rectangle saves as `{x, y, width, height}` coordinates
5. Preview shows sample product in that zone

**Pros:**
- Flexible positioning per template
- Each owner can have different product placement
- Intuitive visual editor
- More professional results

**Cons:**
- Needs UI for zone definition (visual editor)
- More complex backend logic

**Effort:** Medium (M)
**Risk:** Medium

### Option C: AI-Powered Smart Placement
**Description:** Use vision AI to detect the placeholder area automatically and composite intelligently.

**Pros:**
- No manual zone definition
- Could handle various template styles

**Cons:**
- Expensive API calls
- Unpredictable results
- Overkill for consistent templates

**Effort:** Large (L)
**Risk:** High

---

## Technical Considerations

### Backend

#### Data Model Changes

```sql
-- New table: thumbnail_templates
CREATE TABLE thumbnail_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  owner_name TEXT NOT NULL,  -- e.g., "Peter", "Store 1"
  template_url TEXT NOT NULL,  -- Supabase Storage or OneDrive URL
  placement_zone JSONB,  -- {x, y, width, height} for product placement
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, owner_name)
);

-- New column on influencer_tasks
ALTER TABLE influencer_tasks 
  ADD COLUMN thumbnail_url TEXT,
  ADD COLUMN template_id UUID REFERENCES thumbnail_templates(id);
```

#### Image Processing Options
| Library | Pros | Cons |
|---------|------|------|
| **Sharp** | Fast, native bindings, popular | Large binary for Lambda |
| **Jimp** | Pure JS, no binaries | Slower, fewer features |
| **Canvas (node-canvas)** | Full canvas API, flexible | Requires Cairo binaries |
| **Cloudinary** | Managed service, powerful | External dependency, cost |

**Recommendation:** Sharp - best balance of performance and features for Netlify Functions.

#### API Endpoints Needed
1. `POST /thumbnail-templates` - Upload new template
2. `GET /thumbnail-templates` - List user's templates
3. `DELETE /thumbnail-templates/:id` - Remove template
4. `POST /generate-thumbnail` - Generate thumbnail for a task
5. `GET /thumbnail/:taskId` - Get generated thumbnail URL

#### Keepa Product Images
- Already have: `https://m.media-amazon.com/images/I/{imageCode}._SL500_.jpg`
- Need higher resolution for thumbnails: `._SL1500_.jpg` or `._SL1000_.jpg`
- Fallback handling if no image available

### Frontend

#### Web App UI
1. **Settings Page Addition:** "Thumbnail Templates" section
2. **Template Upload Flow:**
   - Upload base image
   - Define owner name (dropdown or text)
   - Visual zone editor (drag rectangle on image)
   - Preview with sample product
3. **Task Creation:** Auto-generate thumbnail when task created (if template exists)

#### Chrome Extension UI
- Current: `⬇️ Download` (video only)
- New: `⬇️ Video` | `🖼️ Thumbnail` OR combined download

### Infrastructure

#### Storage Options
| Option | Pros | Cons |
|--------|------|------|
| **Supabase Storage** | Integrated, RLS | 1GB free tier limit |
| **OneDrive** | Already integrated | User must be connected |
| **Cloudflare R2** | Cheap, fast | New integration needed |

**Recommendation:** Supabase Storage - already integrated, thumbnails are small (~50-200KB each).

#### Processing Location
- **Netlify Function:** Simple, but 10s timeout, 50MB limit
- **Background Job:** More reliable for batch processing

---

## Dependencies & Prerequisites

- [ ] User must have OneDrive connected (for Keepa images to exist)
- [ ] Sharp library compatible with Netlify Functions
- [ ] Supabase Storage bucket for templates/thumbnails
- [ ] Decision on zone editor complexity

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Sharp binary size exceeds Netlify limit | Low | High | Use Jimp fallback or external service |
| Keepa images not available | Medium | Medium | Graceful fallback, show "no image" placeholder |
| Zone editor complexity creeps up | Medium | Medium | Start with fixed coords, iterate |
| Template storage exceeds free tier | Low | Low | Monitor usage, upgrade if needed |

---

## Decisions (Confirmed by Pete)

1. **Owner concept:** Each user uploads their own base template(s) - owner is a label/name
2. **Template count:** Account can have MULTIPLE templates (one per owner)
3. **Product image position:** Defined per template (white box area in example)
4. **Thumbnail output format:** JPEG (smaller file size, no transparency needed)
5. **Auto-generate timing:** When task is created
6. **Chrome extension UX:** Single "Download All" button (video + thumbnail)

---

## Recommendation

**Start with Option B (Metadata Zones)** with simplified MVP:

### MVP Scope:
1. One template per owner (can expand later)
2. Simple coordinate input (x, y, width, height) - no visual editor initially
3. Auto-generate thumbnail when task is created
4. Add thumbnail download to Chrome extension

### Future Enhancements:
- Visual drag-and-drop zone editor
- Multiple templates per owner
- Template preview in settings
- Batch regeneration

---

## Effort Estimate

| Component | Effort |
|-----------|--------|
| Backend: Data model + APIs | 1-2 days |
| Backend: Image compositing | 1 day |
| Frontend: Template upload UI | 1 day |
| Frontend: Zone editor (basic) | 1 day |
| Chrome Extension: Thumbnail download | 0.5 day |
| Testing & polish | 1 day |
| **Total** | **~6-7 days** |

---

## Next Steps (if approved)

1. Confirm answers to open questions
2. Create database migration
3. Implement Sharp-based image compositor
4. Build template upload UI
5. Add thumbnail generation to task creation flow
6. Update Chrome extension download feature
7. QA verification

---

*Analysis created: 2026-01-21*  
*Status: ✅ Approved - Ready for Planning*
