# OneDrive Integration Setup Guide

This guide explains how to configure OneDrive video integration for the eBay Price Reducer.

## Overview

The OneDrive integration allows users to:
- Connect their Microsoft OneDrive account via OAuth
- Select a default folder for video uploads
- Upload product videos to OneDrive (100MB-1GB+ files)
- Manage video metadata linked to products

## Architecture

### Database Tables

1. **`user_onedrive_connections`**
   - Stores encrypted OAuth tokens per user
   - Tracks default folder settings
   - Auto-refreshes expired tokens

2. **`product_videos`**
   - Links videos to products
   - Tracks upload status and metadata
   - References OneDrive file IDs

### Security

- **AES-256-GCM encryption** for OAuth tokens (more secure than CBC)
- **PKCE** (Proof Key for Code Exchange) for OAuth flow
- **Row Level Security** (RLS) - users only access their own data
- **Automatic token refresh** when expired

## Required Environment Variables

Add these to your Netlify environment variables and `.env.local`:

```bash
# Microsoft Azure App Registration
MICROSOFT_CLIENT_ID=your_client_id_here
MICROSOFT_CLIENT_SECRET=your_client_secret_here
MICROSOFT_TENANT_ID=common  # Use "common" for multi-tenant

# OAuth Redirect (auto-configured in most cases)
MICROSOFT_REDIRECT_URI=${URL}/.netlify/functions/onedrive-callback

# Encryption (REQUIRED - 64 hex characters = 32 bytes)
ENCRYPTION_KEY=your_64_character_hex_key_here

# Frontend URL (for OAuth redirects)
FRONTEND_URL=${URL}
```

### Generating the Encryption Key

Run this to generate a secure encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Or use the utility function:
```javascript
const { generateEncryptionKey } = require('./netlify/functions/utils/onedrive-encryption');
console.log(generateEncryptionKey());
```

## Azure App Registration Setup

1. **Create Azure App Registration**
   - Go to [Azure Portal](https://portal.azure.com)
   - Navigate to "Azure Active Directory" → "App registrations"
   - Click "New registration"
   - Name: "eBay Price Reducer - OneDrive"
   - Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
   - Redirect URI: `https://your-domain.netlify.app/.netlify/functions/onedrive-callback`

2. **Configure API Permissions**
   - Go to "API permissions"
   - Add these Microsoft Graph permissions:
     - `Files.ReadWrite` (Delegated)
     - `User.Read` (Delegated)
     - `offline_access` (Delegated)
   - Grant admin consent (if required)

3. **Create Client Secret**
   - Go to "Certificates & secrets"
   - Click "New client secret"
   - Copy the secret value (you won't see it again!)
   - This is your `MICROSOFT_CLIENT_SECRET`

4. **Get Client ID**
   - Go to "Overview"
   - Copy "Application (client) ID"
   - This is your `MICROSOFT_CLIENT_ID`

## Database Migration

Run the migration to create the required tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually apply the migration file:
# supabase/migrations/20260121_onedrive_video_integration.sql
```

## API Endpoints

### OAuth Flow

1. **Start OAuth** - `GET /onedrive-auth-start`
   - Returns authorization URL
   - User visits URL to connect OneDrive

2. **OAuth Callback** - `GET /onedrive-callback?code=...&state=...`
   - Handles redirect from Microsoft
   - Stores encrypted tokens
   - Redirects to frontend

3. **Check Status** - `GET /onedrive-status`
   - Returns connection status
   - Shows email, folder path, token expiry

4. **Disconnect** - `POST /onedrive-disconnect`
   - Removes stored tokens
   - Cleans up OAuth states

### Folder Management

1. **List Folders** - `GET /onedrive-folders?folderId=xxx`
   - Browse OneDrive folder structure
   - Returns folders only (not files)

2. **Set Default Folder** - `POST /onedrive-set-folder`
   - Body: `{ folderId, folderPath }`
   - Saves default upload location

### Video Upload

1. **Create Upload Session** - `POST /onedrive-upload-session`
   - Body: `{ filename, fileSize, productId?, folderId? }`
   - Returns `uploadUrl` for direct upload to OneDrive
   - For large files (100MB-1GB+)

2. **Video Metadata** - `/videos`
   - `GET` - List videos for user/product
   - `POST` - Save metadata after upload
   - `PATCH /:id` - Update metadata
   - `DELETE /:id` - Remove video record

## Testing

### 1. Test Encryption
```javascript
const { encryptToken, decryptToken } = require('./netlify/functions/utils/onedrive-encryption');

const token = 'test_token_12345';
const encrypted = encryptToken(token);
const decrypted = decryptToken(encrypted);

console.log('Original:', token);
console.log('Encrypted:', encrypted);
console.log('Decrypted:', decrypted);
console.log('Match:', token === decrypted);
```

### 2. Test OAuth Flow
```bash
# 1. Start OAuth (in browser or API client)
GET https://your-site.netlify.app/.netlify/functions/onedrive-auth-start
Headers: Authorization: Bearer <your-jwt>

# 2. Visit the returned authUrl in browser
# 3. After redirect, check status:
GET https://your-site.netlify.app/.netlify/functions/onedrive-status
Headers: Authorization: Bearer <your-jwt>
```

### 3. Test Folder Listing
```bash
curl -X GET \
  'https://your-site.netlify.app/.netlify/functions/onedrive-folders' \
  -H 'Authorization: Bearer <your-jwt>'
```

### 4. Test Upload Session
```bash
curl -X POST \
  'https://your-site.netlify.app/.netlify/functions/onedrive-upload-session' \
  -H 'Authorization: Bearer <your-jwt>' \
  -H 'Content-Type: application/json' \
  -d '{
    "filename": "test-video.mp4",
    "fileSize": 50000000,
    "productId": "your-product-id"
  }'
```

## Token Refresh Logic

Tokens automatically refresh when:
- Token expires in < 5 minutes
- API call returns 401 Unauthorized

The `utils/onedrive-api.js` helper handles this transparently.

## Security Considerations

1. **Never log decrypted tokens** - Only log encrypted values
2. **ENCRYPTION_KEY must be 64 hex chars** (32 bytes)
3. **Use HTTPS in production** - OAuth requires secure redirect URIs
4. **Rotate client secrets periodically** - Every 6-12 months
5. **Monitor failed token refreshes** - May indicate revoked access

## Troubleshooting

### "OneDrive not connected" Error
- User needs to complete OAuth flow first
- Check `user_onedrive_connections` table for user's record

### "Token refresh failed" Error
- User may have revoked access in Microsoft account
- Ask user to reconnect via OAuth flow

### "Folder not found" Error
- Folder may have been deleted/moved in OneDrive
- Ask user to select a new default folder

### "Encryption key not set" Error
- `ENCRYPTION_KEY` env variable missing or wrong length
- Must be exactly 64 hex characters

## Files Created

### Database
- `supabase/migrations/20260121_onedrive_video_integration.sql`

### Utilities
- `netlify/functions/utils/onedrive-encryption.js` - AES-256-GCM encryption
- `netlify/functions/utils/onedrive-api.js` - Graph API helpers

### OAuth Functions
- `netlify/functions/onedrive-auth-start.js`
- `netlify/functions/onedrive-callback.js`
- `netlify/functions/onedrive-status.js`
- `netlify/functions/onedrive-disconnect.js`

### Folder Functions
- `netlify/functions/onedrive-folders.js`
- `netlify/functions/onedrive-set-folder.js`

### Video Functions
- `netlify/functions/onedrive-upload-session.js`
- `netlify/functions/videos.js`

## Next Steps

1. ✅ Backend implementation complete
2. 🔄 Frontend integration needed:
   - OAuth connect/disconnect button
   - Folder picker UI
   - Video upload with progress
   - Video list/delete UI
3. 🔄 Testing with real Microsoft account
4. 🔄 Deploy to staging/production

## Support

For issues or questions:
- Check Supabase logs for errors
- Review Netlify function logs
- Verify environment variables are set
- Test with Postman/curl before integrating frontend
