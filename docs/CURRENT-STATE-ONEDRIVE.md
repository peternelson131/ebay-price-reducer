# OneDrive Video Integration - Current State

**Last Updated:** 2026-01-21 ~9:43 AM CST  
**Status:** ✅ Deployed - Ready for Testing

---

## Summary

The OneDrive video integration feature has been fully implemented and deployed. Users can connect their OneDrive account to store product videos, which are uploaded directly to their OneDrive and linked to products in the CRM.

---

## What's Been Completed

### 1. Azure App Registration ✅
- **Client ID:** `b9049877-4d9e-4662-8d60-180649d4e217`
- **Tenant ID:** `common` (multi-tenant)
- **Redirect URI:** `https://dainty-horse-49c336.netlify.app/.netlify/functions/onedrive-callback`
- **API Permissions:** Files.ReadWrite, User.Read, offline_access

### 2. Environment Variables (Netlify) ✅
- `MICROSOFT_CLIENT_ID` - Set
- `MICROSOFT_CLIENT_SECRET` - Set
- `MICROSOFT_TENANT_ID` - Set to "common"

### 3. Database Schema (Supabase) ✅
Two new tables created with RLS policies:

**`user_onedrive_connections`**
- Stores encrypted OAuth tokens per user
- Fields: user_id, access_token_encrypted, refresh_token_encrypted, token_expires_at, default_folder_id, default_folder_path

**`product_videos`**
- Tracks videos uploaded to OneDrive
- Fields: user_id, product_id, onedrive_file_id, onedrive_path, filename, file_size, mime_type, thumbnail_url, duration_seconds, upload_status

### 4. Backend Functions (Netlify) ✅
| Function | Purpose |
|----------|---------|
| `onedrive-auth-start.js` | Generates OAuth URL for Microsoft login |
| `onedrive-callback.js` | Handles OAuth callback, stores encrypted tokens |
| `onedrive-status.js` | Returns connection status for current user |
| `onedrive-disconnect.js` | Removes user's OneDrive connection |
| `onedrive-folders.js` | Lists OneDrive folders for picker |
| `onedrive-set-folder.js` | Saves default upload folder |
| `onedrive-upload-session.js` | Creates resumable upload session |
| `videos.js` | CRUD operations for video metadata |

**Utilities:**
- `utils/onedrive-api.js` - Microsoft Graph API wrapper with token refresh
- `utils/onedrive-encryption.js` - AES-256-GCM token encryption

### 5. Frontend Components ✅
| Component | Purpose |
|-----------|---------|
| `OneDriveConnection.jsx` | Connection status, connect/disconnect buttons |
| `FolderPicker.jsx` | Browse and select OneDrive folder |
| `VideoUploader.jsx` | Drag-drop upload with progress bar |
| `VideoGallery.jsx` | Display uploaded videos with thumbnails |

### 6. Settings Page Integration ✅
- Route added: `/settings`
- OneDrive tab added to Settings page
- Shows connection status and "Connect OneDrive" button

---

## Current UI State

The Settings → OneDrive tab shows:
- **Header:** "OneDrive Video Storage"
- **Description:** "Connect your OneDrive account to store product videos..."
- **Status Card:** "OneDrive Not Connected"
- **Action Button:** "Connect OneDrive" (green button)

---

## What Needs Testing

### OAuth Flow
- [ ] Click "Connect OneDrive" → Microsoft login popup opens
- [ ] Complete Microsoft authentication
- [ ] Callback stores tokens and shows "Connected" status
- [ ] Token refresh works when access token expires

### Folder Selection
- [ ] Folder picker loads OneDrive folders
- [ ] Can navigate into subfolders
- [ ] Selected folder saves correctly
- [ ] Default folder persists on page reload

### Video Upload
- [ ] Small file upload (<10MB) works
- [ ] Large file upload (>100MB) with chunked upload
- [ ] Progress bar shows accurate progress
- [ ] Video metadata saved to database
- [ ] Video appears in gallery after upload

### Multi-User Isolation
- [ ] User A cannot see User B's connection
- [ ] User A cannot see User B's videos
- [ ] RLS policies enforced correctly

### Disconnect Flow
- [ ] Disconnect removes tokens from database
- [ ] UI updates to show "Not Connected"
- [ ] Videos remain in database (linked to OneDrive files)

---

## Known Issues / TODO

1. **ENCRYPTION_KEY env var** - Need to add to Netlify for token encryption
   - Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - Add as `ENCRYPTION_KEY` in Netlify env vars

2. **Settings nav link** - Added to mobile menu only; may want to add to desktop nav

3. **Product CRM integration** - VideoUploader and VideoGallery components exist but ProductCRM page integration needs verification

---

## File Locations

```
Frontend:
├── src/pages/Settings.jsx (OneDrive tab)
├── src/pages/ProductCRM.jsx (video integration)
└── src/components/onedrive/
    ├── index.js
    ├── OneDriveConnection.jsx
    ├── FolderPicker.jsx
    ├── VideoUploader.jsx
    └── VideoGallery.jsx

Backend:
├── netlify/functions/
│   ├── onedrive-auth-start.js
│   ├── onedrive-callback.js
│   ├── onedrive-status.js
│   ├── onedrive-disconnect.js
│   ├── onedrive-folders.js
│   ├── onedrive-set-folder.js
│   ├── onedrive-upload-session.js
│   ├── videos.js
│   └── utils/
│       ├── onedrive-api.js
│       └── onedrive-encryption.js

Database:
└── supabase/migrations/20260121_onedrive_video_integration.sql
```

---

## Related Documentation

- Analysis: `docs/analysis/onedrive-video-integration-analysis.md`
- Implementation Plan: `docs/PLAN-ONEDRIVE-INTEGRATION.md`
- Impact Assessment: `docs/IMPACT-ONEDRIVE-INTEGRATION.md`
- Setup Guide: `docs/ONEDRIVE_SETUP.md`

---

## Next Steps

1. **Add ENCRYPTION_KEY** to Netlify environment variables
2. **Test OAuth flow** by clicking "Connect OneDrive"
3. **Test folder selection** after connecting
4. **Test video upload** to verify full flow
5. **QA verification** of all features
