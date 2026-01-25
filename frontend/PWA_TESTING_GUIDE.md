# PWA Testing Guide - OpSyncPro

## Pre-Deployment Checklist ✅

All items completed:
- [x] Manifest.json created with correct configuration
- [x] Service worker implemented with caching strategies
- [x] Offline fallback page created
- [x] Icons generated in required sizes (192, 512, 180)
- [x] Index.html updated with PWA meta tags
- [x] Service worker registered in main.jsx
- [x] App built successfully (no errors)
- [x] Code committed to git
- [x] Code pushed to main branch
- [x] Netlify auto-deployment triggered

## Netlify Deployment

**Site ID:** `6f7b44f0-fc29-470d-bf7a-3b46f720f359`  
**Expected URL:** https://opsyncpro.io  
**Build Command:** `npm install && cd netlify/functions && npm install && cd ../../frontend && npm install --include=dev && npm run build`  
**Publish Directory:** `frontend/dist`

### Monitoring Deployment

Visit Netlify dashboard at:
https://app.netlify.com/sites/opsyncpro/deploys

The latest deploy should show commit `7fe6a66` with message "feat: Add PWA support for mobile installation"

## Testing Steps

### 1. Verify Deployment Success

Once Netlify finishes building (usually 2-5 minutes):

```bash
# Check if manifest is accessible
curl https://opsyncpro.io/manifest.json

# Check if service worker is accessible
curl https://opsyncpro.io/service-worker.js

# Check if icons exist
curl -I https://opsyncpro.io/icons/icon-192.png
curl -I https://opsyncpro.io/icons/icon-512.png
curl -I https://opsyncpro.io/icons/apple-touch-icon.png

# Check if offline page exists
curl -I https://opsyncpro.io/offline.html
```

All should return HTTP 200 status.

### 2. Desktop Browser Testing

**Chrome/Edge:**
1. Open https://opsyncpro.io
2. Open DevTools (F12)
3. Go to Application tab
4. Check "Manifest" section - should show OpSyncPro details
5. Check "Service Workers" section - should show active worker
6. Look for install prompt icon in address bar (⊕ or install icon)

**Safari:**
1. Open https://opsyncpro.io
2. Check that page loads correctly
3. Verify theme-color in browser chrome

**Firefox:**
1. Open https://opsyncpro.io
2. Open DevTools (F12)
3. Go to Application → Manifest
4. Verify manifest loads correctly

### 3. Mobile Testing - iOS (iPhone/iPad)

#### Prerequisites:
- iOS 11.3 or later
- Safari browser
- Cellular or WiFi connection

#### Installation Steps:
1. **Open Safari** (not Chrome or other browsers)
2. Navigate to `https://opsyncpro.io`
3. Wait for page to fully load
4. Tap the **Share button** (square with arrow pointing up)
5. Scroll down the share sheet
6. Tap **"Add to Home Screen"**
7. Verify icon preview shows OpSyncPro logo
8. Verify name shows "OpSyncPro"
9. Tap **"Add"** in top right
10. Return to home screen
11. Verify OpSyncPro icon appears

#### What to Expect:
- Icon should be OpSyncPro logo with dark background
- Name displayed: "OpSyncPro"
- No Safari browser chrome when launched
- Launches directly to `/product-crm` page
- Status bar should be translucent
- Theme color should be orange (#f97316)

#### Testing Installed App:
1. Tap OpSyncPro icon on home screen
2. Should launch in fullscreen (no Safari UI)
3. Test navigation to Product CRM
4. Test uploading a product image
5. Test creating a new product
6. Enable Airplane Mode
7. Navigate within app - should show offline.html
8. Disable Airplane Mode - should auto-reload

### 4. Mobile Testing - Android

#### Prerequisites:
- Android 5.0 or later
- Chrome browser (recommended)
- Cellular or WiFi connection

#### Installation Steps:
1. **Open Chrome browser**
2. Navigate to `https://opsyncpro.io`
3. Wait for page to fully load
4. Look for "Add to Home screen" banner at bottom
   - OR tap menu (⋮) → "Add to Home screen"
   - OR tap menu (⋮) → "Install app"
5. Review app info in dialog
6. Tap **"Add"** or **"Install"**
7. App icon added to home screen and app drawer

#### What to Expect:
- Icon should be OpSyncPro logo with dark background
- Name displayed: "OpSyncPro"
- No Chrome browser chrome when launched
- Launches directly to `/product-crm` page
- Theme color should be orange in system UI

#### Testing Installed App:
1. Tap OpSyncPro from app drawer or home screen
2. Should launch in fullscreen (no Chrome UI)
3. Test navigation to Product CRM
4. Test uploading a product image
5. Test creating a new product
6. Enable Airplane Mode
7. Navigate within app - should show offline.html
8. Disable Airplane Mode - should auto-reload

### 5. Service Worker Testing

#### Check Registration:
```javascript
// Open browser console on https://opsyncpro.io
navigator.serviceWorker.getRegistration().then(reg => {
  console.log('SW registered:', reg);
  console.log('SW state:', reg.active.state);
});
```

Should log registered service worker.

#### Check Caching:
```javascript
// Open browser console
caches.keys().then(keys => {
  console.log('Cache keys:', keys);
  return caches.open(keys[0]);
}).then(cache => {
  return cache.keys();
}).then(requests => {
  console.log('Cached requests:', requests.map(r => r.url));
});
```

Should show cached assets.

#### Test Offline Mode:
1. Load https://opsyncpro.io in browser
2. Navigate to Product CRM page
3. Open DevTools → Network tab
4. Check "Offline" checkbox
5. Try navigating to a new page
6. Should show offline.html fallback
7. Uncheck "Offline"
8. Page should reload automatically

### 6. Performance Testing

#### Lighthouse Audit:
1. Open Chrome DevTools on https://opsyncpro.io
2. Go to Lighthouse tab
3. Select "Progressive Web App" category
4. Click "Analyze page load"

**Expected PWA Score: 90+**

Key checks:
- ✅ Registers a service worker
- ✅ Responds with 200 when offline
- ✅ Contains a web app manifest
- ✅ Manifest has a maskable icon
- ✅ Is installable
- ✅ Provides a valid apple-touch-icon

#### Network Performance:
1. Open DevTools → Network tab
2. Select "Slow 3G" throttling
3. Reload page
4. First load should cache assets
5. Second load should be faster (from cache)

### 7. Cross-Browser Testing Matrix

| Browser | Platform | Install | Offline | Notes |
|---------|----------|---------|---------|-------|
| Safari | iOS 16+ | ✅ | ✅ | Primary target |
| Chrome | Android 13+ | ✅ | ✅ | Primary target |
| Chrome | Desktop | ⚠️ | ✅ | Install available |
| Edge | Desktop | ⚠️ | ✅ | Install available |
| Firefox | Desktop | ❌ | ✅ | No install UI |
| Safari | macOS | ⚠️ | ✅ | Limited support |

## Troubleshooting

### Issue: "Add to Home Screen" not appearing

**iOS:**
- Ensure using Safari (not Chrome)
- Must be on HTTPS (http won't work)
- Already installed apps won't show option again
- Try in Private Browsing mode

**Android:**
- Ensure using Chrome
- Visit the page at least twice
- Must meet installability criteria
- Check manifest.json is loading

### Issue: Service Worker not registering

**Check:**
1. Must be HTTPS in production
2. service-worker.js must be in root of site
3. Check browser console for errors
4. Verify MIME type is `application/javascript`

**Fix:**
```bash
# Verify file exists and is accessible
curl -I https://opsyncpro.io/service-worker.js

# Should return:
# HTTP/2 200
# content-type: application/javascript
```

### Issue: Offline mode not working

**Check:**
1. Service worker is registered and active
2. Offline.html exists at /offline.html
3. Navigate to a new page (not just reload)
4. Check Network tab for failed requests

### Issue: Icons not showing

**Check:**
1. Icons exist in /icons/ directory
2. Manifest.json has correct paths
3. Icons are PNG format (not SVG)
4. File sizes are reasonable (<50KB each)

### Issue: Wrong start URL

**Check:**
1. manifest.json has `"start_url": "/product-crm"`
2. Clear browser cache and reinstall
3. Uninstall old version first

## Success Criteria

✅ **Basic PWA:**
- [ ] Manifest loads without errors
- [ ] Service worker registers successfully
- [ ] Install prompt appears on mobile
- [ ] App installs to home screen
- [ ] Launches in standalone mode

✅ **Offline Support:**
- [ ] Offline.html displays when no connection
- [ ] Previously visited pages load from cache
- [ ] Auto-reconnects when online

✅ **Mobile Experience:**
- [ ] No browser chrome in standalone mode
- [ ] Correct icon displays
- [ ] Correct app name displays
- [ ] Theme color applies to system UI
- [ ] Launches to /product-crm page

✅ **Functionality:**
- [ ] Product CRM accessible
- [ ] Can view products
- [ ] Can upload images
- [ ] Can create products
- [ ] Video upload works

## Post-Testing

Once all tests pass:

1. Document any issues found
2. Take screenshots of successful installation
3. Test on multiple devices if possible
4. Share findings with team
5. Monitor real user installations

## Support Resources

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [web.dev: PWA Checklist](https://web.dev/pwa-checklist/)
- [Can I Use: Service Workers](https://caniuse.com/serviceworkers)
- [Netlify Docs: Custom Headers](https://docs.netlify.com/routing/headers/)

---

**Created:** January 24, 2026  
**Version:** 1.0  
**Contact:** Frontend Agent Team
