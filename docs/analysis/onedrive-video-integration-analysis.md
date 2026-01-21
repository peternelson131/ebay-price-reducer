# OneDrive Video Integration Analysis

**Feature:** OneDrive video storage integration with Product CRM + Chrome extension for Amazon Influencer uploads  
**Analysis Date:** 2026-01-20 (Updated: 2026-01-21)  
**Status:** ✅ Approved - Ready for Implementation  
**Requested By:** Pete

---

## Key Decision (2026-01-21)

**OneDrive confirmed as storage solution** (not Supabase Storage alternative)

**Rationale:**
- Videos will be **larger files** (100MB - 1GB+)
- Pete already pays for OneDrive/Microsoft 365
- No bandwidth costs hit the app
- Videos stay in user's control

---

## Executive Summary

Enable users to store product videos in their personal OneDrive accounts, associate videos with CRM product records, and use a Chrome extension to streamline uploads to Amazon Influencer Program. Videos from primary ASINs should auto-associate with correlated upload tasks.

---

## Problem Statement

**Current State:**
- Users manually manage videos for Amazon Influencer uploads
- No centralized association between videos and product records
- Upload process to Amazon Influencer is manual and time-consuming
- When accepting correlated tasks from correlation finder, video associations must be manually recreated

**Desired State:**
- Videos stored in user's personal OneDrive (no storage costs for us)
- Videos linked to CRM product records
- Chrome extension provides upload queue for Amazon Influencer
- Video associations automatically propagate to correlated tasks

---

## Requirements Summary

| Requirement | Detail |
|-------------|--------|
| OneDrive Auth | Per-user OAuth (multi-tenant) |
| Folder Structure | User defines one global folder destination |
| Video Privacy | Users cannot see other users' videos |
| CRM Integration | Integrates with existing `sourced_products` table |
| Extension | Upload queue + direct upload to Amazon Influencer |
| Auto-Association | Primary ASIN video → correlated task videos |

---

## Proposed Approaches

### Upload Strategy

#### Option A: Direct-to-OneDrive Upload

**Description:** User's browser uploads video directly to OneDrive via Microsoft Graph API. Our backend only stores metadata (file ID, path, timestamps).

```
User → OneDrive API → OneDrive Storage
         ↓
Our Backend ← Metadata only (file ID, path)
```

**Pros:**
- Zero storage costs for us
- No bandwidth costs (user → OneDrive directly)
- Simpler infrastructure
- User's storage, user's problem

**Cons:**
- Large file uploads may be unreliable from browser
- Requires chunked upload implementation for files >4MB
- User experience depends on their internet speed to Microsoft
- Need to handle resume/retry for failed uploads

**Effort:** M  
**Risk:** Medium (upload reliability)

---

#### Option B: Staged Upload (Our Servers → OneDrive)

**Description:** Video uploads to our server first (temporary), then we transfer to OneDrive in background. Provides more control over the process.

```
User → Our Server (temp) → OneDrive
              ↓
         Metadata stored
```

**Pros:**
- More reliable upload experience
- Can validate/process video before transfer
- Better progress tracking
- Can retry OneDrive transfer without user re-uploading

**Cons:**
- Double storage cost during transfer
- Double bandwidth (user→us, us→OneDrive)
- More complex infrastructure
- Temporary storage management needed

**Effort:** L  
**Risk:** Low (reliability) / High (cost)

---

#### Option C: Hybrid - Small Direct, Large Staged

**Description:** Files under 50MB upload directly to OneDrive. Larger files stage through our servers for reliability.

**Pros:**
- Best of both worlds
- Most videos likely under 50MB (quick direct upload)
- Large files get reliability of staging

**Cons:**
- More complex logic
- Two code paths to maintain

**Effort:** L  
**Risk:** Medium

---

### 🎯 Recommendation: Option A (Direct-to-OneDrive)

**Rationale:**
- Microsoft Graph API supports resumable uploads for large files
- Zero ongoing storage costs
- Simpler architecture long-term

### ⚠️ Large File Handling (CRITICAL)

**Requirement:** Videos will be **100MB - 1GB+** in size.

**Microsoft Graph API Upload Options:**
| Method | Max Size | Use Case |
|--------|----------|----------|
| Simple PUT | 4MB | ❌ Too small |
| Resumable Upload Session | 250GB | ✅ Required |

**Implementation:**
1. Create upload session via `POST /drive/items/{parent-id}:/filename:/createUploadSession`
2. Upload in 10MB chunks (or 320KB multiples up to 60MB)
3. Handle interruptions - can resume from last successful chunk
4. Track progress for UI feedback

**Reference:** [Microsoft Graph Large File Upload](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession)

---

## Technical Considerations

### Backend

#### Data Model Changes

```sql
-- New table: user OneDrive connections
CREATE TABLE user_onedrive_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  access_token TEXT NOT NULL,  -- encrypted
  refresh_token TEXT NOT NULL, -- encrypted
  token_expires_at TIMESTAMPTZ NOT NULL,
  default_folder_id TEXT,      -- OneDrive folder ID
  default_folder_path TEXT,    -- Human-readable path
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- New table: video metadata
CREATE TABLE product_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  product_id UUID REFERENCES sourced_products,
  onedrive_file_id TEXT NOT NULL,
  onedrive_path TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size BIGINT,
  mime_type TEXT,
  thumbnail_url TEXT,          -- OneDrive thumbnail URL
  upload_status TEXT DEFAULT 'pending', -- pending, uploading, complete, failed
  amazon_upload_status TEXT,   -- null, queued, uploaded
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(onedrive_file_id)
);

-- RLS: Users only see their own videos
CREATE POLICY "Users see own videos" ON product_videos
  FOR ALL USING (auth.uid() = user_id);
```

#### API Endpoints Needed

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/onedrive/auth-url` | GET | Generate OAuth URL |
| `/api/onedrive/callback` | GET | Handle OAuth callback |
| `/api/onedrive/disconnect` | POST | Remove OneDrive connection |
| `/api/onedrive/folders` | GET | List folders for picker |
| `/api/onedrive/set-folder` | POST | Set default folder |
| `/api/onedrive/upload-url` | POST | Get upload URL for direct upload |
| `/api/videos` | GET/POST | CRUD for video metadata |
| `/api/videos/:id/associate` | POST | Link video to product |

#### OAuth Token Management

- Store encrypted tokens in `user_onedrive_connections`
- Implement token refresh before expiry
- Microsoft tokens expire in 1 hour, refresh tokens in 90 days
- Consider background job to refresh tokens proactively

---

### Frontend

#### UI Components Needed

1. **OneDrive Connection Widget** (Settings page)
   - Connect/Disconnect button
   - Connection status indicator
   - Folder picker/selector

2. **Video Upload Component** (CRM Product Form)
   - Drag-drop zone
   - Upload progress bar
   - Thumbnail preview after upload
   - Error states (disconnected, quota exceeded)

3. **Video Gallery** (on product record)
   - Thumbnail grid
   - Play/preview modal
   - Delete option
   - "Queue for Amazon Upload" button

#### User Flows

**Flow 1: Connect OneDrive**
```
Settings → "Connect OneDrive" → Microsoft OAuth → 
Redirect back → Select folder → Save
```

**Flow 2: Upload Video to Product**
```
Product CRM → Edit Product → Drag video → 
Upload progress → Complete → Video appears in gallery
```

**Flow 3: Queue for Amazon Upload**
```
Product Gallery → "Add to Upload Queue" → 
Toast confirms → Extension badge updates count
```

---

### Chrome Extension

#### Architecture Options

##### Option A: Extension Talks to Our Backend

```
Extension ↔ Our Backend ↔ OneDrive
                ↓
         Task Queue DB
```

**Pros:**
- Centralized queue management
- Works across devices
- Better analytics

**Cons:**
- More backend complexity
- Network dependency

##### Option B: Extension Talks Directly to OneDrive

```
Extension ↔ OneDrive (direct)
    ↓
Local Queue Storage
```

**Pros:**
- Simpler architecture
- Faster file access
- Works offline (for queue)

**Cons:**
- Queue not synced across devices
- Auth token management in extension

#### 🎯 Recommendation: Option A (Backend-Managed Queue)

Queue management through our backend allows better coordination with CRM and works across devices.

#### Extension Features

1. **Upload Queue View**
   - List of pending uploads
   - Video thumbnail + product info
   - ASIN, title auto-populated

2. **Upload Workflow**
   - Click "Upload" → Opens Amazon Influencer page
   - Auto-fills available fields (may require page automation)
   - User completes upload
   - Mark as complete in extension

3. **Amazon Influencer Integration**
   - **Challenge:** Amazon has no public API for Influencer uploads
   - **Approach:** Page automation (detect upload form, pre-fill fields)
   - **Limitation:** Can't fully automate without risking ToS issues

---

### Video Correlation Auto-Association

When user accepts correlated tasks from correlation finder:

```javascript
// Pseudocode
async function acceptCorrelatedTask(primaryAsin, correlatedAsin) {
  // Find videos associated with primary ASIN
  const primaryVideos = await getVideosForAsin(primaryAsin);
  
  // Create associations for correlated task
  for (const video of primaryVideos) {
    await createVideoAssociation({
      videoId: video.id,
      productId: correlatedTaskProductId,
      inheritedFrom: primaryAsin
    });
  }
}
```

Need to add `inherited_from_product_id` column to track provenance.

---

## Dependencies & Prerequisites

- [ ] Microsoft Azure App Registration (for OAuth)
- [ ] Microsoft Graph API permissions: `Files.ReadWrite`, `User.Read`
- [ ] Supabase Edge Function for token encryption
- [ ] Chrome Extension Developer account (if not existing)
- [ ] Define Amazon Influencer upload flow (manual research needed)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Large file upload failures | **High** | **High** | **CRITICAL:** Implement chunked/resumable uploads (files 100MB-1GB+) |
| Microsoft API rate limits | Low | Medium | Implement backoff, queue uploads |
| Amazon blocks automation | Medium | High | Keep automation minimal, mostly form pre-fill |
| Token refresh failures | Low | Medium | Proactive refresh, clear error messaging |
| User OneDrive quota exceeded | Low | Low | Check quota before upload, clear error |

---

## Open Questions

1. **Amazon Influencer Upload Flow**
   - Need to research exact upload page structure
   - What fields can we pre-fill?
   - Any API or is it all page automation?

2. **Video Thumbnails**
   - Use OneDrive's generated thumbnails, or generate our own?
   - OneDrive thumbnails require API call each time (may be slow)

3. **Multiple Videos per Product**
   - Can a product have multiple videos?
   - If yes, which one(s) propagate to correlated tasks?

4. **Extension Auth**
   - Does extension share auth with web app, or separate login?

5. **Offline Support**
   - Should extension work offline with local queue?

---

## Effort Estimates

| Component | Effort | Notes |
|-----------|--------|-------|
| Backend (OAuth + API) | L | OAuth flow, token management, video metadata |
| Frontend (CRM integration) | M | Upload widget, folder picker, video gallery |
| Chrome Extension | L-XL | Queue UI, OneDrive integration, Amazon page automation |
| Video Correlation Logic | S | Association propagation |
| **Total** | **XL** | Recommend phased approach |

---

## Recommended Phases

### Phase 1: OneDrive Connection + Basic Upload
- OAuth flow
- Folder selection
- Direct upload to OneDrive
- Video metadata storage
- Basic CRM integration (upload + view)

### Phase 2: Chrome Extension (Queue Only)
- Extension with upload queue
- Manual marking of upload completion
- Basic Amazon page detection

### Phase 3: Video Correlation
- Auto-association on task acceptance
- Inherited video tracking

### Phase 4: Enhanced Amazon Integration
- Page automation for form pre-fill
- Better upload workflow

---

## Next Steps (if approved)

1. **Research:** Manual walkthrough of Amazon Influencer upload process
2. **Azure Setup:** Register Microsoft Azure app for OAuth
3. **Phase 1 Planning:** Break down into implementation tasks
4. **Prototype:** OAuth flow proof-of-concept

---

*Analysis created: 2026-01-20*  
*Updated: 2026-01-21*  
*Status: ✅ APPROVED*  
*Large file support: CONFIRMED (100MB-1GB+ videos)*  
*Ready for: Phase 1 Implementation*
