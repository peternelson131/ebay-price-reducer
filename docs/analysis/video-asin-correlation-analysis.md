# Video-ASIN Correlation + Multi-Marketplace Dubbing Analysis

## Executive Summary
Extend the video system to correlate videos with ASINs (not just products), support user marketplace approvals, and enable auto-dubbing for non-English marketplaces. This creates a complete video-to-Amazon-upload pipeline.

## Problem Statement
Currently, videos are linked to CRM products only. When a product has multiple correlated ASINs, the video association is lost. Additionally, different Amazon marketplaces require different languages, but we have no way to track which marketplaces a user is approved for or manage dubbed versions of videos.

## Current State

### Database Schema
```
product_videos
├── id (UUID)
├── user_id → auth.users
├── product_id → sourced_products (nullable)
├── onedrive_file_id
├── onedrive_path
├── filename
├── file_size
├── mime_type
├── upload_status
└── created_at

sourced_products
├── id (UUID)
├── asin (single ASIN field)
├── ... other product fields
```

### Current Limitations
1. Videos link to products, not ASINs directly
2. No tracking of user marketplace approvals
3. No video language/variant tracking
4. No integration with existing auto-dubbing system
5. One ASIN per product (via `asin` field) - but ASIN correlation can find related ASINs

---

## Proposed Approaches

### Option A: Lightweight - Video-ASIN Junction Table Only
**Description:** Add a simple junction table linking videos to ASINs. Marketplace/language handled manually.

**Schema Changes:**
```sql
-- New junction table
CREATE TABLE video_asin_associations (
  id UUID PRIMARY KEY,
  video_id UUID REFERENCES product_videos(id),
  asin TEXT NOT NULL,
  marketplace TEXT, -- 'US', 'UK', 'DE', etc.
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(video_id, asin, marketplace)
);
```

**Pros:**
- Simple implementation
- Minimal changes to existing system
- Quick to deploy

**Cons:**
- No language variant tracking
- No marketplace approval enforcement
- Manual process for dubbing

**Effort:** Small (S)
**Risk:** Low

---

### Option B: Full Video Variant System
**Description:** Complete system with video variants (dubbed versions), marketplace approvals, and auto-dub integration.

**Schema Changes:**
```sql
-- User marketplace approvals
CREATE TABLE user_marketplace_approvals (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  marketplace TEXT NOT NULL, -- 'US', 'UK', 'DE', 'JP', etc.
  language TEXT NOT NULL,    -- 'en', 'de', 'ja', etc.
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,    -- Optional expiry
  UNIQUE(user_id, marketplace)
);

-- Marketplace reference data
CREATE TABLE marketplaces (
  code TEXT PRIMARY KEY,     -- 'US', 'UK', 'DE', etc.
  name TEXT NOT NULL,        -- 'United States', 'Germany', etc.
  language TEXT NOT NULL,    -- 'en', 'de', 'ja', etc.
  requires_dubbing BOOLEAN DEFAULT false,
  amazon_domain TEXT         -- 'amazon.com', 'amazon.de', etc.
);

-- Video variants (dubbed versions)
CREATE TABLE video_variants (
  id UUID PRIMARY KEY,
  original_video_id UUID REFERENCES product_videos(id),
  language TEXT NOT NULL,    -- 'en', 'de', 'ja', etc.
  onedrive_file_id TEXT,
  onedrive_path TEXT,
  filename TEXT NOT NULL,
  file_size BIGINT,
  dub_status TEXT DEFAULT 'pending', -- 'pending', 'processing', 'complete', 'failed'
  dub_job_id TEXT,           -- Eleven Labs job reference
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(original_video_id, language)
);

-- Video-ASIN associations (with marketplace)
CREATE TABLE video_asin_associations (
  id UUID PRIMARY KEY,
  video_id UUID REFERENCES product_videos(id),
  variant_id UUID REFERENCES video_variants(id), -- nullable (original or variant)
  asin TEXT NOT NULL,
  marketplace TEXT REFERENCES marketplaces(code),
  upload_status TEXT DEFAULT 'pending', -- 'pending', 'uploaded', 'failed'
  uploaded_at TIMESTAMPTZ,
  amazon_video_id TEXT,      -- Reference from Amazon after upload
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(asin, marketplace)  -- One video per ASIN per marketplace
);
```

**Pros:**
- Complete solution
- Supports all future requirements
- Proper variant tracking
- Marketplace approval enforcement

**Cons:**
- More complex implementation
- Longer timeline
- More testing needed

**Effort:** Large (L)
**Risk:** Medium

---

### Option C: Phased Approach (Recommended)
**Description:** Start with Option A basics, then add variants and approvals in Phase 2.

**Phase 1 (Now):**
- Video-ASIN junction table
- Auto-populate ASINs when video uploaded to product with correlations
- Basic marketplace field (no enforcement)

**Phase 2 (Later):**
- User marketplace approvals
- Video variants for dubbed versions
- Auto-dub integration
- Upload tracking

**Pros:**
- Get value quickly
- Learn from Phase 1 before building Phase 2
- Lower initial risk
- Can adjust Phase 2 based on real usage

**Cons:**
- Two implementation cycles
- Some rework possible

**Effort:** Medium (M) total - Small (S) for Phase 1
**Risk:** Low

---

## Technical Considerations

### Backend
- Need API to auto-associate video with product's correlated ASINs
- Dub trigger endpoint (integrate with existing dub-video.js)
- Marketplace CRUD for approvals
- Variant management APIs

### Frontend
- VideoGallery: Show ASIN associations
- Settings: Marketplace approval management
- VideoUploader: Option to select target marketplaces
- Variant viewer: See/play different language versions

### Auto-Dubbing Integration
Current system: dub-video.js uses Eleven Labs
- Needs: Queue dubbed videos by marketplace
- Store variants in OneDrive (same folder, language suffix)
- Filename pattern: `{ASIN}_{language}.{ext}` (e.g., `B08XYZ_de.mov`)

### Marketplace-Language Mapping
| Marketplace | Language | Requires Dubbing |
|-------------|----------|------------------|
| US | en | No |
| CA | en | No |
| UK | en | No |
| AU | en | No |
| DE | de | Yes |
| FR | fr | Yes |
| ES | es | Yes |
| IT | it | Yes |
| MX | es | Yes |
| JP | ja | Yes |

---

## Answered Questions

1. **ASIN Correlation Source:** 
   - ✅ **APPROVED correlations only** - Only ASINs from approved correlation results get video tasks
   - Declined correlations do NOT get linked to videos

2. **Dub Timing:** 
   - ✅ **Manual trigger** - User clicks "Dub" button when ready
   - Dub **once per language**, not per task (shared across all tasks needing that language)

3. **Video Review:** 
   - ✅ User reviews dubbed video before uploading to Amazon

4. **Amazon Upload:** 
   - ✅ **Manual upload** - System prepares videos, user uploads via Amazon portal

5. **OneDrive Structure:**
   ```
   📁 [User's Selected Folder]/
   ├── B08XYZ123.mov              ← Original (English)
   ├── 📁 content-german/
   │   └── B08XYZ123_German.mov   ← Dubbed (shared by all German tasks)
   ├── 📁 content-french/
   │   └── B08XYZ123_French.mov
   └── 📁 content-japanese/
       └── B08XYZ123_Japanese.mov
   ```

6. **File Naming:** `{OriginalASIN}_{Language}.{ext}`
   - Uses the CRM product's ASIN (not the correlated ASIN)
   - Dubbed file is shared across all tasks for that language

---

## Recommendation

**Phased implementation with clear workflow:**

### Phase 1: Video-Task Correlation
1. When video uploaded to CRM product, link to **approved** correlation tasks only
2. Show video availability on each upload task
3. Tasks display: ASIN, marketplace, language requirement, video status

### Phase 2: Dubbing & Variants
1. Manual "Dub" button on tasks requiring non-English
2. Create language sub-folders in OneDrive (`content-german/`, etc.)
3. Dub once per language, shared across all tasks
4. Track dubbed variants with status

### Phase 3: Marketplace Approvals (future)
1. User settings for approved marketplaces
2. Filter tasks by approved marketplaces

---

## Next Steps (if approved)

### Phase 1 Tasks
1. [ ] Link videos to approved correlation tasks (not declined)
2. [ ] Update task display to show associated video
3. [ ] Add video indicator on task cards
4. [ ] Allow viewing original video from task

### Phase 2 Tasks
1. [ ] Create `video_variants` table for dubbed versions
2. [ ] Add "Dub" button on tasks requiring different language
3. [ ] Create OneDrive sub-folders: `content-{language}/`
4. [ ] Integrate Eleven Labs dubbing
5. [ ] Save dubbed file as `{ASIN}_{Language}.{ext}`
6. [ ] Update task to show dubbed video when available
7. [ ] Allow preview/download of dubbed version

### Phase 3 Tasks (future)
1. [ ] User marketplace approval settings
2. [ ] Filter available tasks by approved marketplaces

---

*Analysis created: 2026-01-21*
*Status: Ready for Review*
