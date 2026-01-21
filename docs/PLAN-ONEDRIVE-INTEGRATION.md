# Implementation Plan: OneDrive Video Integration

**Created:** 2026-01-21  
**Status:** 🚀 Ready for Implementation

---

## Task Breakdown

### Task 1: Database Schema (Backend)
**Agent:** Backend  
**Effort:** S (1-2 hours)

**Deliverables:**
- [ ] Create migration file `xxx_onedrive_video_integration.sql`
- [ ] Table: `user_onedrive_connections`
- [ ] Table: `product_videos`
- [ ] RLS policies for both tables
- [ ] Run migration on Supabase

**Acceptance Criteria:**
- Tables exist in Supabase
- RLS policies prevent cross-user access
- Foreign keys properly reference existing tables

---

### Task 2: Token Encryption Utility (Backend)
**Agent:** Backend  
**Effort:** S (1 hour)

**Deliverables:**
- [ ] Create `utils/encryption.js` if not exists
- [ ] `encryptToken(token)` function
- [ ] `decryptToken(encrypted)` function
- [ ] Use AES-256-GCM or similar

**Acceptance Criteria:**
- Tokens encrypted before DB storage
- Tokens decrypted for API calls
- ENCRYPTION_KEY env var documented

---

### Task 3: Microsoft OAuth Flow (Backend)
**Agent:** Backend  
**Effort:** M (3-4 hours)

**Deliverables:**
- [ ] `netlify/functions/onedrive-auth-start.js` - Generate OAuth URL
- [ ] `netlify/functions/onedrive-callback.js` - Handle callback, store tokens
- [ ] `netlify/functions/onedrive-status.js` - Check connection status
- [ ] `netlify/functions/onedrive-disconnect.js` - Remove connection
- [ ] Token refresh logic

**Acceptance Criteria:**
- User can initiate OAuth from frontend
- Callback stores encrypted tokens
- Status endpoint returns connection state
- Disconnect removes tokens from DB

**Microsoft Scopes Required:**
```
Files.ReadWrite
User.Read
offline_access
```

---

### Task 4: OneDrive Folder API (Backend)
**Agent:** Backend  
**Effort:** S (2 hours)

**Deliverables:**
- [ ] `netlify/functions/onedrive-folders.js` - List folders
- [ ] `netlify/functions/onedrive-set-folder.js` - Save default folder

**Acceptance Criteria:**
- Can list root and nested folders
- Can save selected folder ID and path
- Handles token refresh if needed

---

### Task 5: Video Upload API (Backend)
**Agent:** Backend  
**Effort:** M (3-4 hours)

**Deliverables:**
- [ ] `netlify/functions/onedrive-upload-session.js` - Create resumable upload session
- [ ] `netlify/functions/videos.js` - CRUD for video metadata

**Upload Session Response:**
```json
{
  "uploadUrl": "https://...",
  "expirationDateTime": "..."
}
```

**Acceptance Criteria:**
- Creates upload session for files >4MB
- Returns upload URL for frontend direct upload
- Video metadata saved after upload completes

---

### Task 6: Settings UI - OneDrive Connection (Frontend)
**Agent:** Frontend  
**Effort:** M (3-4 hours)

**Deliverables:**
- [ ] OneDrive connection card in Settings page
- [ ] "Connect OneDrive" button → OAuth flow
- [ ] Connection status display (connected/disconnected)
- [ ] Folder picker component
- [ ] "Disconnect" button with confirmation

**Acceptance Criteria:**
- Clear visual status of connection
- OAuth popup/redirect works
- Folder picker shows OneDrive folders
- Selected folder displayed after save

---

### Task 7: Video Upload Component (Frontend)
**Agent:** Frontend  
**Effort:** L (4-6 hours)

**Deliverables:**
- [ ] `VideoUploader.jsx` component
- [ ] Drag-drop zone
- [ ] File validation (video types only)
- [ ] Chunked upload with progress bar
- [ ] Error handling (disconnected, failed)
- [ ] Retry logic for failed chunks

**Acceptance Criteria:**
- Accepts video files (mp4, mov, etc.)
- Shows upload progress percentage
- Handles files 100MB-1GB+
- Resumes failed uploads
- Shows error states clearly

---

### Task 8: Video Gallery Component (Frontend)
**Agent:** Frontend  
**Effort:** M (2-3 hours)

**Deliverables:**
- [ ] `VideoGallery.jsx` component
- [ ] Thumbnail grid display
- [ ] Video preview/play modal
- [ ] Delete video option
- [ ] Integration with ProductCRM page

**Acceptance Criteria:**
- Shows thumbnails for uploaded videos
- Click to preview/play
- Delete removes from DB (not OneDrive)
- Empty state when no videos

---

### Task 9: CRM Integration (Frontend)
**Agent:** Frontend  
**Effort:** S (1-2 hours)

**Deliverables:**
- [ ] Add VideoUploader to product edit form
- [ ] Add VideoGallery to product detail view
- [ ] Associate videos with product on upload

**Acceptance Criteria:**
- Can upload video while editing product
- Videos display on product detail
- Videos linked to correct product_id

---

### Task 10: QA Testing
**Agent:** QA  
**Effort:** M (2-3 hours)

**Test Cases:**
- [ ] OAuth connect/disconnect flow
- [ ] Folder selection persistence
- [ ] Small file upload (<10MB)
- [ ] Large file upload (>100MB)
- [ ] Upload interruption and resume
- [ ] Multi-user isolation (user A can't see user B's videos)
- [ ] Token refresh (wait for expiry or simulate)
- [ ] Error states (disconnected during upload)

---

## Task Dependencies

```
Task 1 (Schema) ─────┬──► Task 3 (OAuth) ──► Task 6 (Settings UI)
                     │
Task 2 (Encryption) ─┤
                     │
                     └──► Task 4 (Folders) ──► Task 6 (Settings UI)
                     │
                     └──► Task 5 (Upload API) ──► Task 7 (Upload Component)
                                                        │
                                                        ▼
                                               Task 8 (Gallery)
                                                        │
                                                        ▼
                                               Task 9 (CRM Integration)
                                                        │
                                                        ▼
                                               Task 10 (QA Testing)
```

## Execution Order

**Batch 1 (Parallel - Backend):**
- Task 1: Database Schema
- Task 2: Token Encryption

**Batch 2 (Sequential - Backend):**
- Task 3: OAuth Flow
- Task 4: Folder API
- Task 5: Upload API

**Batch 3 (Parallel - Frontend):**
- Task 6: Settings UI
- Task 7: Upload Component
- Task 8: Gallery Component

**Batch 4 (Frontend):**
- Task 9: CRM Integration

**Batch 5 (QA):**
- Task 10: Full Testing

---

## Pre-requisites (DevOps/Manual)

⚠️ **Before coding begins:**

1. **Azure App Registration**
   - Go to Azure Portal → App Registrations
   - Create new registration
   - Add redirect URI: `https://dainty-horse-49c336.netlify.app/.netlify/functions/onedrive-callback`
   - Generate client secret
   - Note: Client ID, Client Secret, Tenant ID

2. **Environment Variables**
   - Add to Netlify:
     - `MICROSOFT_CLIENT_ID`
     - `MICROSOFT_CLIENT_SECRET`
     - `MICROSOFT_TENANT_ID` (use "common" for multi-tenant)

---

## Estimated Timeline

| Phase | Tasks | Time |
|-------|-------|------|
| Backend | 1-5 | 1-2 days |
| Frontend | 6-9 | 2-3 days |
| QA | 10 | 1 day |
| **Total** | | **4-6 days** |

---

*Plan complete. Ready for /implement.*
