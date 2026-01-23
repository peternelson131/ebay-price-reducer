# OAuth Configuration Guide

This guide walks through setting up OAuth apps for Instagram (Meta) and YouTube (Google) for the Social Posting MVP.

---

## Prerequisites

- Access to [Meta for Developers](https://developers.facebook.com/)
- Access to [Google Cloud Console](https://console.cloud.google.com/)
- Your app's public URL (e.g., `https://your-app.netlify.app`)

---

## Instagram (Meta App)

### Step 1: Create Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/apps/)
2. Click **Create App**
3. Select **Business** as app type
4. Fill in app details:
   - **App Name**: Your App Name (e.g., "eBay Price Reducer Social")
   - **App Contact Email**: Your email
5. Click **Create App**

### Step 2: Add Instagram Basic Display

1. In your app dashboard, go to **Add Products**
2. Find **Instagram Basic Display** and click **Set Up**
3. Scroll to **User Token Generator**
4. Add your **Instagram Test Users**
5. Click **Generate Token** for testing

### Step 3: Configure OAuth Settings

1. Go to **Instagram Basic Display** → **Basic Display**
2. Scroll to **Valid OAuth Redirect URIs**
3. Add:
   ```
   https://your-app.netlify.app/.netlify/functions/social-accounts-callback
   ```
4. Click **Save Changes**

### Step 4: Request Permissions

1. Go to **App Review** → **Permissions and Features**
2. Request these permissions:
   - `instagram_basic` (approved automatically)
   - `instagram_content_publish` (requires review)
3. For `instagram_content_publish`:
   - Click **Request**
   - Fill out the form explaining your use case
   - Provide screencast of your app
   - Wait for approval (typically 1-3 days)

### Step 5: Get Credentials

1. Go to **Settings** → **Basic**
2. Copy **App ID** → This is your `META_APP_ID`
3. Copy **App Secret** → This is your `META_APP_SECRET`
4. Add to `.env`:
   ```env
   META_APP_ID=your-app-id
   META_APP_SECRET=your-app-secret
   ```

### Step 6: Switch to Live Mode

1. Go to **Settings** → **Basic**
2. Toggle **App Mode** from Development to Live
3. Note: You can test in Development mode first with test users

---

## YouTube (Google Cloud Project)

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project details:
   - **Project Name**: Your App Name
   - **Organization**: (optional)
4. Click **Create**

### Step 2: Enable YouTube Data API

1. In your project, go to **APIs & Services** → **Library**
2. Search for **YouTube Data API v3**
3. Click on it
4. Click **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** user type (unless you have Google Workspace)
3. Click **Create**
4. Fill in required fields:
   - **App name**: Your App Name
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **Save and Continue**
6. **Scopes** page:
   - Click **Add or Remove Scopes**
   - Search and add:
     - `https://www.googleapis.com/auth/youtube.upload`
     - `https://www.googleapis.com/auth/youtube.readonly`
   - Click **Update**
   - Click **Save and Continue**
7. **Test users** page:
   - Add your Google account email
   - Click **Save and Continue**
8. Review and click **Back to Dashboard**

### Step 4: Create OAuth 2.0 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Choose **Web application**
4. Configure:
   - **Name**: Your App OAuth Client
   - **Authorized JavaScript origins**: (optional)
     ```
     https://your-app.netlify.app
     ```
   - **Authorized redirect URIs**:
     ```
     https://your-app.netlify.app/.netlify/functions/social-accounts-callback
     ```
5. Click **Create**
6. Copy credentials:
   - **Client ID** → This is your `GOOGLE_CLIENT_ID`
   - **Client secret** → This is your `GOOGLE_CLIENT_SECRET`
7. Add to `.env`:
   ```env
   GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=xxx
   ```

### Step 5: Verify App

1. Go to **OAuth consent screen**
2. Click **Publish App**
3. Review and confirm
4. Note: App will be in "Testing" mode until verified
5. For production, submit for verification:
   - Go to **OAuth consent screen**
   - Click **Prepare for verification**
   - Follow the verification process

### Step 6: Test Mode vs Production

**Testing Mode:**
- Limited to 100 users
- No verification required
- Good for development/testing

**Production Mode:**
- Requires verification by Google
- Can take 4-6 weeks
- Requires demonstration video
- Privacy policy required

---

## Testing Your Setup

### Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add to `.env`:
```env
SOCIAL_TOKEN_ENCRYPTION_KEY=your-64-char-hex-key
```

### Test Instagram Connection

1. Deploy your Netlify functions
2. Call the connect endpoint:
   ```bash
   curl -X POST https://your-app.netlify.app/.netlify/functions/social-accounts-connect \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"platform":"instagram"}'
   ```
3. Open the returned `authorizationUrl` in browser
4. Authorize the app
5. Should redirect to callback and close window
6. Check database for encrypted token

### Test YouTube Connection

1. Call the connect endpoint:
   ```bash
   curl -X POST https://your-app.netlify.app/.netlify/functions/social-accounts-connect \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"platform":"youtube"}'
   ```
2. Open the returned `authorizationUrl` in browser
3. Authorize the app (select YouTube channel)
4. Should redirect to callback and close window
5. Check database for encrypted token

---

## Common Issues

### Instagram

**Issue:** "Redirect URI mismatch"
- **Solution:** Ensure redirect URI exactly matches what's configured in Meta app settings (including https://)

**Issue:** "This app is in Development Mode"
- **Solution:** Add test users in Instagram Basic Display settings, or switch app to Live mode

**Issue:** "Permissions not granted"
- **Solution:** Request `instagram_content_publish` in App Review

**Issue:** "Invalid access token"
- **Solution:** Check that token encryption/decryption is working correctly

### YouTube

**Issue:** "Redirect URI mismatch"
- **Solution:** Ensure redirect URI exactly matches OAuth client configuration (including https://)

**Issue:** "Access blocked: This app's request is invalid"
- **Solution:** Verify OAuth consent screen is configured and scopes are correct

**Issue:** "The OAuth client was not found"
- **Solution:** Check that GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are correct

**Issue:** "Rate limit exceeded"
- **Solution:** YouTube API has quota limits. Request quota increase in Cloud Console.

---

## Security Best Practices

### Environment Variables
- ✅ Never commit credentials to git
- ✅ Use separate keys for dev/staging/production
- ✅ Rotate secrets periodically
- ✅ Store encryption key separately from app secrets

### OAuth Scopes
- ✅ Only request necessary permissions
- ✅ Explain clearly why each permission is needed
- ✅ Handle permission errors gracefully

### Token Storage
- ✅ Always encrypt tokens at rest
- ✅ Never log decrypted tokens
- ✅ Implement token refresh logic
- ✅ Delete tokens on account disconnect

### Error Handling
- ✅ Don't expose internal errors to users
- ✅ Log errors for debugging
- ✅ Provide clear user-facing messages
- ✅ Implement retry logic for transient failures

---

## Rate Limits

### Instagram (Meta Graph API)
- **Rate limit**: 200 calls per hour per user
- **Media container creation**: ~10 per hour recommended
- **Publishing**: No hard limit, but rate limited
- **Best practice**: Space out posts, implement backoff

### YouTube Data API v3
- **Quota**: 10,000 units per day (default)
- **Upload cost**: 1,600 units per video
- **Max uploads per day**: ~6 videos (default quota)
- **Quota increase**: Request in Cloud Console (can get 100,000+)
- **Best practice**: Monitor quota usage, request increase early

---

## Production Checklist

### Meta App
- [ ] App is in Live mode
- [ ] `instagram_content_publish` permission approved
- [ ] Business verification complete (if required)
- [ ] Privacy policy URL added
- [ ] Terms of service URL added
- [ ] App icon/logo uploaded
- [ ] Redirect URIs configured for production

### Google Cloud Project
- [ ] OAuth consent screen published
- [ ] App verification submitted (if needed)
- [ ] Privacy policy URL added
- [ ] Terms of service URL added
- [ ] Correct scopes requested
- [ ] Quota increase requested (if needed)
- [ ] Redirect URIs configured for production

### Environment
- [ ] Production encryption key generated
- [ ] All credentials set in Netlify
- [ ] WEBHOOK_SECRET configured
- [ ] URL points to production domain
- [ ] Database migration applied
- [ ] Scheduled function running

---

## Support & Documentation

### Meta/Instagram
- [Instagram Graph API Docs](https://developers.facebook.com/docs/instagram-api)
- [Content Publishing Guide](https://developers.facebook.com/docs/instagram-api/guides/content-publishing)
- [App Review Guide](https://developers.facebook.com/docs/app-review)

### YouTube
- [YouTube Data API Docs](https://developers.google.com/youtube/v3)
- [Videos: insert](https://developers.google.com/youtube/v3/docs/videos/insert)
- [OAuth 2.0 Guide](https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps)
- [Quota Calculator](https://developers.google.com/youtube/v3/determine_quota_cost)

---

**Setup complete! You're ready to start posting to Instagram and YouTube.**
