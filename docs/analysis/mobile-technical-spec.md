# OpsyncPro Mobile Technical Specification
**Generated:** January 24, 2026  
**Purpose:** Technical requirements for iOS App Store and Google Play Store deployment

---

## Table of Contents
1. [Current Stack Assessment](#1-current-stack-assessment)
2. [PWA Technical Requirements](#2-pwa-technical-requirements)
3. [Capacitor Technical Requirements](#3-capacitor-technical-requirements)
4. [App Store Technical Submission Requirements](#4-app-store-technical-submission-requirements)
5. [OAuth Flow Changes](#5-oauth-flow-changes)
6. [Backend Changes Required](#6-backend-changes-required)

---

## 1. Current Stack Assessment

### 1.1 Framework & Build Tools

**Frontend Framework:**
- **Vite 4.5.14** - Build tool and dev server
- **React 18.2.0** - UI framework
- **React Router DOM 6.15.0** - Client-side routing

**State Management:**
- **@tanstack/react-query 4.32.0** - Server state management
- **React Context API** - Auth and theme state (AuthContext, ThemeContext)

**UI Framework:**
- **Tailwind CSS 3.3.3** - Utility-first CSS
- **@headlessui/react 1.7.17** - Unstyled accessible components
- **@heroicons/react 2.0.18** - Icon library
- **lucide-react 0.562.0** - Additional icons

**Key Dependencies:**
```json
{
  "@supabase/supabase-js": "^2.38.0",
  "react-hook-form": "^7.45.4",
  "react-dropzone": "^14.3.8",
  "react-toastify": "^9.1.3",
  "date-fns": "^2.30.0",
  "lodash": "^4.17.21",
  "xlsx": "^0.18.5"
}
```

**Build Configuration (`vite.config.js`):**
```javascript
{
  server: {
    port: 3000,
    proxy: { '/api': 'http://localhost:3001' }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          // ... other chunks
        }
      }
    }
  }
}
```

### 1.2 Current Mobile Responsiveness State

**Responsive Design Implementation:**
- **163 occurrences** of Tailwind responsive breakpoints (`sm:`, `md:`, `lg:`, `xl:`)
- Mobile-first design pattern already in use

**Tailwind Breakpoints (Default):**
```
sm: 640px   // Small devices
md: 768px   // Medium devices
lg: 1024px  // Large devices
xl: 1280px  // Extra large devices
```

**Current Mobile Features:**
- Mobile hamburger menu in `App.jsx` with overlay navigation
- Responsive navbar that collapses on mobile
- Mobile-optimized layouts in key pages (Listings, Dashboard, etc.)

**Existing Mobile UI Patterns:**
```jsx
// Example from App.jsx
<div className="hidden lg:flex items-center">
  {/* Desktop nav */}
</div>
<div className="lg:hidden">
  {/* Mobile menu button */}
</div>
```

**Viewport Meta Tag:**
```html
<!-- frontend/index.html -->
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

### 1.3 Existing PWA Configuration

**Current Status:** ❌ **NO PWA CONFIG**

**Missing Files:**
- ❌ No `manifest.json` or `manifest.webmanifest`
- ❌ No service worker (`sw.js` or `service-worker.js`)
- ❌ No PWA icons in `/public`
- ❌ No offline fallback pages

**Existing Assets:**
```
frontend/public/
├── app-icon.png (23KB)
├── logo.svg
├── logo-stacked-light.png
├── logo-email.png
├── assets/logos/
│   └── logo-icon.svg
```

---

## 2. PWA Technical Requirements

### 2.1 Web App Manifest

**File:** `frontend/public/manifest.json`

```json
{
  "name": "OpSyncPro - Marketplace & Influencer Tools",
  "short_name": "OpSyncPro",
  "description": "Automated eBay listing management and influencer product discovery",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#18181b",
  "theme_color": "#f97316",
  "orientation": "portrait-primary",
  "scope": "/",
  "categories": ["business", "productivity", "shopping"],
  "icons": [
    {
      "src": "/icons/icon-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-96x96.png",
      "sizes": "96x96",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-128x128.png",
      "sizes": "128x128",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-144x144.png",
      "sizes": "144x144",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-152x152.png",
      "sizes": "152x152",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/icons/icon-384x384.png",
      "sizes": "384x384",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ],
  "screenshots": [
    {
      "src": "/screenshots/mobile-1.png",
      "sizes": "540x720",
      "type": "image/png",
      "form_factor": "narrow"
    },
    {
      "src": "/screenshots/desktop-1.png",
      "sizes": "1280x720",
      "type": "image/png",
      "form_factor": "wide"
    }
  ],
  "prefer_related_applications": false,
  "related_applications": []
}
```

**Required Icon Sizes:**
```
72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
```

**Icon Generation:**
```bash
# Use app-icon.png (already exists) as source
# Generate all sizes from frontend/public/app-icon.png
# Tool: https://realfavicongenerator.net/ or ImageMagick

convert app-icon.png -resize 72x72 icons/icon-72x72.png
convert app-icon.png -resize 96x96 icons/icon-96x96.png
# ... repeat for all sizes
```

### 2.2 Service Worker Implementation

**File:** `frontend/public/sw.js`

```javascript
const CACHE_NAME = 'opsyncpro-v1';
const RUNTIME_CACHE = 'opsyncpro-runtime';

// Core app shell to cache
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/assets/logos/logo-icon.svg',
  '/offline.html'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first, fall back to cache
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') return;
  
  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) return;
  
  // API requests - network only (don't cache)
  if (request.url.includes('/.netlify/functions/') || 
      request.url.includes('.supabase.co') ||
      request.url.includes('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // App assets - network first, fallback to cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Clone the response before caching
        const responseToCache = response.clone();
        caches.open(RUNTIME_CACHE)
          .then((cache) => cache.put(request, responseToCache));
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // If offline and no cache, show offline page
            if (request.mode === 'navigate') {
              return caches.match('/offline.html');
            }
          });
      })
  );
});
```

**Service Worker Registration:**

**File:** `frontend/src/main.jsx` (add after ReactDOM.render)

```javascript
// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}
```

### 2.3 Offline Fallback Page

**File:** `frontend/public/offline.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - OpSyncPro</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #18181b;
      color: #f4f4f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      text-align: center;
    }
    .container {
      max-width: 400px;
    }
    h1 {
      color: #f97316;
      font-size: 24px;
      margin-bottom: 16px;
    }
    p {
      color: #a1a1aa;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>You're Offline</h1>
    <p>OpSyncPro requires an internet connection to sync your listings and access marketplace data.</p>
    <p>Please check your connection and try again.</p>
  </div>
</body>
</html>
```

### 2.4 HTML Updates

**File:** `frontend/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/assets/logos/logo-icon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    
    <!-- PWA Meta Tags -->
    <meta name="theme-color" content="#f97316" />
    <meta name="description" content="Automated eBay listing management and influencer product discovery" />
    <link rel="manifest" href="/manifest.json" />
    
    <!-- iOS Specific -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="OpSyncPro" />
    <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
    
    <title>OpSyncPro.io</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### 2.5 Vite PWA Plugin (Optional but Recommended)

**Install:**
```bash
npm install -D vite-plugin-pwa
```

**Update `vite.config.js`:**
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        // Same as manifest.json above
      },
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-api',
            }
          },
          {
            urlPattern: /^https:\/\/.*\.netlify\.app\/\.netlify\/functions\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'netlify-functions',
            }
          }
        ]
      }
    })
  ],
  // ... rest of config
})
```

### 2.6 PWA Feature Limitations

**✅ Features That Work:**
- Offline UI shell (cached HTML/CSS/JS)
- App icon on home screen
- Standalone display mode (no browser chrome)
- Basic notifications (Web Push API)
- Local storage persistence
- IndexedDB for offline data

**❌ Features That DON'T Work (PWA-only):**
- Camera access (limited, no full control)
- Push notifications (requires user opt-in, limited on iOS)
- Background sync (unreliable on iOS)
- File system access (very limited)
- Deep linking (limited)
- App Store distribution
- In-app purchases
- Native UI components

**⚠️ iOS Safari Limitations:**
- Service workers cache limited to ~50MB
- Push notifications require iOS 16.4+
- No badging API
- No install prompt (user must manually "Add to Home Screen")
- Background tasks extremely limited

---

## 3. Capacitor Technical Requirements

### 3.1 Core Dependencies

**Install Capacitor:**
```bash
# Navigate to frontend directory
cd /Users/jcsdirect/clawd/projects/ebay-price-reducer/frontend

# Install Capacitor core and CLI
npm install @capacitor/core @capacitor/cli

# Install platform-specific packages
npm install @capacitor/ios @capacitor/android

# Install required plugins
npm install @capacitor/app @capacitor/splash-screen @capacitor/status-bar
npm install @capacitor/browser @capacitor/network @capacitor/preferences

# OAuth and deep linking
npm install @capacitor/app-launcher
npm install @capacitor-community/http

# Camera and media
npm install @capacitor/camera @capacitor/filesystem

# Push notifications
npm install @capacitor/push-notifications

# Social sharing
npm install @capacitor/share
```

**Total New Dependencies:**
```json
{
  "@capacitor/core": "^5.7.0",
  "@capacitor/cli": "^5.7.0",
  "@capacitor/ios": "^5.7.0",
  "@capacitor/android": "^5.7.0",
  "@capacitor/app": "^5.0.6",
  "@capacitor/splash-screen": "^5.0.6",
  "@capacitor/status-bar": "^5.0.6",
  "@capacitor/browser": "^5.1.0",
  "@capacitor/network": "^5.0.6",
  "@capacitor/preferences": "^5.0.6",
  "@capacitor/app-launcher": "^5.0.6",
  "@capacitor/camera": "^5.0.8",
  "@capacitor/filesystem": "^5.1.4",
  "@capacitor/push-notifications": "^5.1.0",
  "@capacitor/share": "^5.0.6",
  "@capacitor-community/http": "^1.4.1"
}
```

### 3.2 Initialize Capacitor

**Initialize:**
```bash
npx cap init OpSyncPro io.opsyncpro.app --web-dir=dist
```

**This creates:** `frontend/capacitor.config.ts`

```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.opsyncpro.app',
  appName: 'OpSyncPro',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // For production
    cleartext: false,
    // For local development
    // url: 'http://192.168.1.100:3000',
    // cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#18181b',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      iosSpinnerStyle: 'small',
      spinnerColor: '#f97316'
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#18181b'
    }
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'opsyncpro'
  },
  android: {
    scheme: 'https',
    hostname: 'app.opsyncpro.io'
  }
};

export default config;
```

### 3.3 Add Native Platforms

```bash
# Build the web app first
npm run build

# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android
```

**This creates:**
```
frontend/
├── ios/                    # Native iOS project
│   ├── App/
│   │   ├── App/
│   │   │   ├── Info.plist
│   │   │   ├── Assets.xcassets/
│   │   │   └── ...
│   │   └── App.xcodeproj
│   └── Podfile
├── android/               # Native Android project
│   ├── app/
│   │   ├── src/
│   │   │   └── main/
│   │   │       ├── AndroidManifest.xml
│   │   │       ├── res/
│   │   │       └── java/
│   │   └── build.gradle
│   └── build.gradle
└── capacitor.config.ts
```

### 3.4 Deep Linking Configuration

**iOS URL Scheme (`ios/App/App/Info.plist`):**

Add to existing file:
```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>opsyncpro</string>
    </array>
    <key>CFBundleURLName</key>
    <string>io.opsyncpro.app</string>
  </dict>
</array>

<!-- Universal Links (for OAuth callbacks) -->
<key>com.apple.developer.associated-domains</key>
<array>
  <string>applinks:app.opsyncpro.io</string>
  <string>applinks:www.opsyncpro.io</string>
</array>
```

**Android Deep Links (`android/app/src/main/AndroidManifest.xml`):**

Add to `<activity>` tag:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  
  <!-- Custom URL Scheme -->
  <data android:scheme="opsyncpro" />
</intent-filter>

<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  
  <!-- Universal Links / App Links -->
  <data android:scheme="https"
        android:host="app.opsyncpro.io" />
  <data android:scheme="https"
        android:host="www.opsyncpro.io" />
</intent-filter>
```

**App Links Verification (Android):**

Host this file at: `https://app.opsyncpro.io/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.opsyncpro.app",
    "sha256_cert_fingerprints": [
      "YOUR_APP_SHA256_FINGERPRINT"
    ]
  }
}]
```

**Universal Links Verification (iOS):**

Host this file at: `https://app.opsyncpro.io/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "YOUR_TEAM_ID.io.opsyncpro.app",
        "paths": ["/oauth/*", "/auth/*"]
      }
    ]
  }
}
```

### 3.5 Push Notifications Setup

**iOS Configuration:**

1. **Enable capability in Xcode:**
   - Open `ios/App/App.xcodeproj`
   - Select target → Signing & Capabilities
   - Add "Push Notifications" capability
   - Add "Background Modes" → Check "Remote notifications"

2. **Request permissions in code:**

**File:** `frontend/src/services/pushNotifications.js`

```javascript
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

export const initPushNotifications = async () => {
  if (!Capacitor.isNativePlatform()) {
    console.log('Push notifications only work on native platforms');
    return;
  }

  // Request permission
  const permStatus = await PushNotifications.requestPermissions();
  
  if (permStatus.receive === 'granted') {
    await PushNotifications.register();
  }

  // Register listeners
  PushNotifications.addListener('registration', (token) => {
    console.log('Push registration success, token:', token.value);
    // Send token to backend
    savePushToken(token.value);
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('Push registration error:', error);
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    console.log('Push received:', notification);
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    console.log('Push action performed:', notification);
  });
};

async function savePushToken(token) {
  // Call backend API to save token
  const response = await fetch('/.netlify/functions/save-push-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, platform: Capacitor.getPlatform() })
  });
}
```

**Call in `main.jsx`:**
```javascript
import { initPushNotifications } from './services/pushNotifications'

// After ReactDOM.render
if (Capacitor.isNativePlatform()) {
  initPushNotifications();
}
```

**Android Configuration:**

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

**Firebase Cloud Messaging (FCM) Setup:**

1. Create project in Firebase Console
2. Download `google-services.json` → place in `android/app/`
3. Update `android/build.gradle`:
```gradle
dependencies {
    classpath 'com.google.gms:google-services:4.3.15'
}
```
4. Update `android/app/build.gradle`:
```gradle
apply plugin: 'com.google.gms.google-services'
```

### 3.6 Camera Plugin Configuration

**iOS Permissions (`ios/App/App/Info.plist`):**

```xml
<key>NSCameraUsageDescription</key>
<string>OpSyncPro needs camera access to take photos of products</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>OpSyncPro needs access to your photo library to select product images</string>

<key>NSPhotoLibraryAddUsageDescription</key>
<string>OpSyncPro needs permission to save photos to your library</string>
```

**Android Permissions (`android/app/src/main/AndroidManifest.xml`):**

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" 
                 android:maxSdkVersion="32" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" 
                 android:maxSdkVersion="29" />
```

**Usage Example:**

```javascript
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

const takePicture = async () => {
  const image = await Camera.getPhoto({
    quality: 90,
    allowEditing: true,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera
  });
  
  // image.dataUrl contains base64 image
  return image.dataUrl;
};
```

### 3.7 Build Commands

**Development:**
```bash
# Build web app
npm run build

# Sync web assets to native projects
npx cap sync

# Open in native IDEs
npx cap open ios      # Opens Xcode
npx cap open android  # Opens Android Studio

# Run on device
npx cap run ios --target="YOUR_DEVICE_NAME"
npx cap run android --target="YOUR_DEVICE_ID"
```

**Production Builds:**
```bash
# iOS (requires Xcode)
# 1. Build web app
npm run build

# 2. Sync to iOS
npx cap sync ios

# 3. Open Xcode
npx cap open ios

# 4. In Xcode:
#    - Select "Any iOS Device (arm64)" or your connected device
#    - Product → Archive
#    - Distribute App → App Store Connect

# Android (command line)
# 1. Build web app
npm run build

# 2. Sync to Android
npx cap sync android

# 3. Build release APK/AAB
cd android
./gradlew assembleRelease          # For APK
./gradlew bundleRelease             # For AAB (App Bundle)
```

**Update Native Projects:**
```bash
# When you update web code
npm run build
npx cap copy

# When you add/remove plugins
npx cap sync

# When you update Capacitor itself
npx cap update
```

---

## 4. App Store Technical Submission Requirements

### 4.1 iOS App Store

**Prerequisites:**
- **Apple Developer Account** ($99/year)
  - Enroll at: https://developer.apple.com/programs/enroll/
- **Mac with Xcode** (14.0+ for iOS 16+ support)
- **Physical iOS device** for testing (recommended)

**Certificates & Provisioning:**

1. **App ID Registration:**
   - Go to Apple Developer → Certificates, IDs & Profiles
   - Create App ID: `io.opsyncpro.app`
   - Enable capabilities:
     - Push Notifications
     - Associated Domains
     - Sign in with Apple (if using)

2. **Certificates Required:**
   ```
   Development Certificate:
   - Apple Development (for testing on device)
   
   Distribution Certificate:
   - Apple Distribution (for App Store submission)
   ```

3. **Provisioning Profiles:**
   ```
   Development Profile:
   - Type: iOS App Development
   - App ID: io.opsyncpro.app
   - Devices: Your test devices
   
   Distribution Profile:
   - Type: App Store
   - App ID: io.opsyncpro.app
   ```

4. **Generate Certificates (via Xcode):**
   - Open Xcode → Preferences → Accounts
   - Add Apple ID
   - Select team → Manage Certificates → + → Apple Distribution
   - Xcode will generate and download certificates

**Xcode Configuration:**

**File:** `ios/App/App/Info.plist` (complete configuration)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- App Metadata -->
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleDisplayName</key>
  <string>OpSyncPro</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>$(PRODUCT_NAME)</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  
  <!-- Privacy Permissions -->
  <key>NSCameraUsageDescription</key>
  <string>OpSyncPro needs camera access to take photos of products for your listings</string>
  <key>NSPhotoLibraryUsageDescription</key>
  <string>OpSyncPro needs access to your photo library to select product images</string>
  <key>NSPhotoLibraryAddUsageDescription</key>
  <string>OpSyncPro needs permission to save product photos to your library</string>
  
  <!-- Network -->
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <false/>
  </dict>
  
  <!-- Deep Linking -->
  <key>CFBundleURLTypes</key>
  <array>
    <dict>
      <key>CFBundleURLSchemes</key>
      <array>
        <string>opsyncpro</string>
      </array>
      <key>CFBundleURLName</key>
      <string>io.opsyncpro.app</string>
    </dict>
  </array>
  
  <!-- Universal Links -->
  <key>com.apple.developer.associated-domains</key>
  <array>
    <string>applinks:app.opsyncpro.io</string>
    <string>applinks:www.opsyncpro.io</string>
  </array>
  
  <!-- Supported Interface Orientations -->
  <key>UISupportedInterfaceOrientations</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>
  
  <!-- iPad Specific -->
  <key>UISupportedInterfaceOrientations~ipad</key>
  <array>
    <string>UIInterfaceOrientationPortrait</string>
    <string>UIInterfaceOrientationPortraitUpsideDown</string>
    <string>UIInterfaceOrientationLandscapeLeft</string>
    <string>UIInterfaceOrientationLandscapeRight</string>
  </array>
  
  <!-- Status Bar -->
  <key>UIStatusBarStyle</key>
  <string>UIStatusBarStyleDefault</string>
  <key>UIViewControllerBasedStatusBarAppearance</key>
  <true/>
  
  <!-- Launch Screen -->
  <key>UILaunchStoryboardName</key>
  <string>LaunchScreen</string>
</dict>
</plist>
```

**App Icons (Required Sizes for iOS):**
```
ios/App/App/Assets.xcassets/AppIcon.appiconset/
├── icon-20@2x.png      (40x40)
├── icon-20@3x.png      (60x60)
├── icon-29@2x.png      (58x58)
├── icon-29@3x.png      (87x87)
├── icon-40@2x.png      (80x80)
├── icon-40@3x.png      (120x120)
├── icon-60@2x.png      (120x120)
├── icon-60@3x.png      (180x180)
├── icon-76.png         (76x76)
├── icon-76@2x.png      (152x152)
├── icon-83.5@2x.png    (167x167)
└── icon-1024.png       (1024x1024) ← Required for App Store
```

**Splash Screen:**
```
ios/App/App/Assets.xcassets/Splash.imageset/
├── splash.png          (2732x2732) - single universal image
└── splash@2x.png       (2732x2732)
└── splash@3x.png       (2732x2732)
```

**Privacy Manifest (iOS 17+):**

**File:** `ios/App/App/PrivacyInfo.xcprivacy`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyTracking</key>
  <false/>
</dict>
</plist>
```

**App Store Connect Submission:**

1. **Create App Record:**
   - Go to App Store Connect
   - My Apps → + → New App
   - Bundle ID: `io.opsyncpro.app`
   - SKU: `opsyncpro-001`
   - Primary Language: English (U.S.)

2. **Required Metadata:**
   ```
   App Name: OpSyncPro
   Subtitle: eBay & Influencer Tools
   Category: Primary: Business, Secondary: Productivity
   
   Description: (4000 char max)
   "OpSyncPro is an all-in-one platform for eBay sellers and content creators..."
   
   Keywords: (100 char max)
   "ebay,marketplace,influencer,product,listing,automation,amazon,tiktok"
   
   Support URL: https://www.opsyncpro.io/support
   Marketing URL: https://www.opsyncpro.io
   Privacy Policy URL: https://www.opsyncpro.io/privacy
   ```

3. **Screenshots Required:**
   ```
   iPhone 6.7" Display (1290 x 2796 pixels) - Required
   - 3-10 screenshots
   
   iPhone 6.5" Display (1284 x 2778 pixels) - Optional
   iPhone 5.5" Display (1242 x 2208 pixels) - Optional
   
   iPad Pro 12.9" (2048 x 2732 pixels) - If supporting iPad
   ```

4. **App Review Information:**
   - Demo account credentials (if app requires login)
   - Notes for reviewer
   - Contact information

**Build & Upload:**
```bash
# 1. Build in Xcode
# Product → Archive

# 2. Validate Archive
# Window → Organizer → Archives → Validate App

# 3. Upload to App Store Connect
# Distribute App → App Store Connect → Upload

# 4. Wait for processing (10-30 minutes)

# 5. Submit for Review
# App Store Connect → TestFlight or App Store → Submit
```

### 4.2 Android / Google Play Store

**Prerequisites:**
- **Google Play Console Account** ($25 one-time fee)
  - Register at: https://play.google.com/console/signup
- **Android Studio** (latest version)
- **Java Development Kit (JDK)** 11 or higher

**Signing Configuration:**

1. **Generate Release Keystore:**
```bash
cd /Users/jcsdirect/clawd/projects/ebay-price-reducer/frontend/android

keytool -genkey -v -keystore opsyncpro-release.keystore \
  -alias opsyncpro \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000

# Answer prompts:
# Keystore password: [CREATE_STRONG_PASSWORD]
# Key password: [SAME_OR_DIFFERENT_PASSWORD]
# First/Last name: OpSyncPro
# Organizational unit: Engineering
# Organization: OpSyncPro
# City: [Your city]
# State: [Your state]
# Country code: US
```

**CRITICAL:** Store keystore file and passwords securely. **Losing this means you can never update your app.**

2. **Configure Signing:**

**File:** `android/app/build.gradle`

```gradle
android {
    ...
    
    signingConfigs {
        release {
            if (project.hasProperty('OPSYNCPRO_RELEASE_STORE_FILE')) {
                storeFile file(OPSYNCPRO_RELEASE_STORE_FILE)
                storePassword OPSYNCPRO_RELEASE_STORE_PASSWORD
                keyAlias OPSYNCPRO_RELEASE_KEY_ALIAS
                keyPassword OPSYNCPRO_RELEASE_KEY_PASSWORD
            }
        }
    }
    
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
        }
    }
}
```

3. **Store Credentials Securely:**

**File:** `android/gradle.properties` (add to .gitignore!)

```properties
OPSYNCPRO_RELEASE_STORE_FILE=../opsyncpro-release.keystore
OPSYNCPRO_RELEASE_STORE_PASSWORD=your_keystore_password
OPSYNCPRO_RELEASE_KEY_ALIAS=opsyncpro
OPSYNCPRO_RELEASE_KEY_PASSWORD=your_key_password
```

**AndroidManifest.xml Configuration:**

**File:** `android/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="io.opsyncpro.app">

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
                     android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
                     android:maxSdkVersion="29" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    
    <!-- Optional permissions -->
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />

    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/AppTheme"
        android:usesCleartextTraffic="false">

        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode"
            android:label="@string/title_activity_main"
            android:launchMode="singleTask"
            android:theme="@style/AppTheme.NoActionBarLaunch"
            android:exported="true">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

            <!-- Deep Links -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="opsyncpro" />
            </intent-filter>

            <!-- App Links -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https"
                      android:host="app.opsyncpro.io" />
            </intent-filter>
        </activity>

        <!-- Firebase Cloud Messaging -->
        <service
            android:name="com.google.firebase.messaging.FirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>
    </application>
</manifest>
```

**App Icons (Android):**
```
android/app/src/main/res/
├── mipmap-mdpi/
│   └── ic_launcher.png        (48x48)
├── mipmap-hdpi/
│   └── ic_launcher.png        (72x72)
├── mipmap-xhdpi/
│   └── ic_launcher.png        (96x96)
├── mipmap-xxhdpi/
│   └── ic_launcher.png        (144x144)
├── mipmap-xxxhdpi/
│   └── ic_launcher.png        (192x192)
└── drawable/
    └── splash.png             (2732x2732)
```

**Adaptive Icon (Android 8.0+):**
```
android/app/src/main/res/
├── mipmap-mdpi/
│   ├── ic_launcher_foreground.png
│   └── ic_launcher_background.png
├── mipmap-anydpi-v26/
│   └── ic_launcher.xml
```

**File:** `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`
```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
```

**Build Release AAB:**
```bash
cd /Users/jcsdirect/clawd/projects/ebay-price-reducer/frontend

# Build web app
npm run build

# Sync to Android
npx cap sync android

# Build release App Bundle
cd android
./gradlew bundleRelease

# Output: android/app/build/outputs/bundle/release/app-release.aab
```

**Google Play Console Submission:**

1. **Create App:**
   - Go to Google Play Console
   - Create app
   - App name: OpSyncPro
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free

2. **Store Listing:**
   ```
   Short description: (80 chars)
   "eBay listing automation and influencer product discovery"
   
   Full description: (4000 chars)
   "OpSyncPro is an all-in-one platform for eBay sellers and content creators..."
   
   App icon: 512x512 PNG (32-bit with transparency)
   Feature graphic: 1024x500 PNG or JPG
   
   Screenshots:
   - Phone: 2-8 screenshots (16:9 or 9:16 ratio)
   - 7-inch tablet: 2-8 screenshots (optional)
   - 10-inch tablet: 2-8 screenshots (optional)
   
   Video: YouTube URL (optional)
   
   Category: Business / Productivity
   Tags: eBay, Marketplace, Automation
   ```

3. **Content Rating:**
   - Complete questionnaire
   - Likely rating: Everyone / PEGI 3

4. **App Content:**
   - Privacy policy URL: https://www.opsyncpro.io/privacy
   - Data safety section (what data you collect)
   - Declare ads (if any)
   - Target audience (18+)

5. **Release:**
   - Production track
   - Upload `app-release.aab`
   - Release name: "1.0.0"
   - Release notes: "Initial release"
   - Roll out to 100% of users

**Data Safety Declaration (Examples):**
```
Data collected:
✓ Email address (for authentication)
✓ User account info (username, password)
✓ User-generated content (product listings)
✓ App activity (usage analytics)

Data shared:
✗ No data shared with third parties

Data security:
✓ Data encrypted in transit
✓ Data encrypted at rest
✓ Users can request data deletion
```

---

## 5. OAuth Flow Changes

### 5.1 Current OAuth Implementation

**Current Flow (Web):**
1. User clicks "Connect eBay" → `/.netlify/functions/ebay-oauth-start`
2. Backend generates OAuth URL → redirects to eBay
3. eBay auth page → user approves
4. eBay redirects to: `https://app.opsyncpro.io/integrations?ebay_connected=true&code=...`
5. Frontend detects URL params → shows success message
6. Backend exchanges code for token (handled in callback endpoint)

**Callback URLs (Current):**
```
eBay Sandbox: https://app.opsyncpro.io/integrations
eBay Production: https://app.opsyncpro.io/integrations

Instagram: https://app.opsyncpro.io/integrations?social=connected
YouTube: https://app.opsyncpro.io/integrations?social=connected
TikTok: (Coming soon)
```

### 5.2 Required Changes for Mobile

**Problem:** Browser-based OAuth redirects won't return to the native app.

**Solution:** Deep linking + custom URL schemes

**New OAuth Flow (Mobile):**

1. User clicks "Connect eBay" in app
2. App opens in-app browser (Capacitor Browser plugin)
3. Navigate to `/.netlify/functions/ebay-oauth-start?platform=mobile&redirect_scheme=opsyncpro`
4. Backend detects `platform=mobile` → generates modified redirect URI
5. eBay auth → user approves
6. eBay redirects to: `opsyncpro://oauth/callback?code=...` (custom scheme)
   OR: `https://app.opsyncpro.io/oauth/callback?code=...` (universal link)
7. Deep link triggers app to reopen
8. App catches deep link → extracts code → calls backend to complete auth

**Mobile Detection:**

**File:** `frontend/src/utils/platform.js` (new file)

```javascript
import { Capacitor } from '@capacitor/core';

export const isMobile = () => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = () => {
  return Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
};

export const getOAuthRedirectScheme = () => {
  if (isMobile()) {
    return 'opsyncpro://oauth/callback';
  }
  return `${window.location.origin}/integrations`;
};
```

**Updated OAuth Initiation:**

**File:** `frontend/src/pages/Integrations.jsx` (modify connectEbay function)

```javascript
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { isMobile, getOAuthRedirectScheme } from '../utils/platform';

const connectEbay = async () => {
  setConnecting(true);
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const redirectScheme = getOAuthRedirectScheme();
    const platform = isMobile() ? 'mobile' : 'web';

    const response = await fetch('/.netlify/functions/ebay-oauth-start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ platform, redirectUri: redirectScheme })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    if (isMobile()) {
      // Open in-app browser
      await Browser.open({ url: data.authUrl });
      
      // Listen for deep link callback
      const listener = await CapApp.addListener('appUrlOpen', async (event) => {
        // event.url = "opsyncpro://oauth/callback?code=..."
        const url = new URL(event.url);
        if (url.pathname === '/oauth/callback') {
          const code = url.searchParams.get('code');
          
          // Close browser
          await Browser.close();
          
          // Complete OAuth flow
          await completeOAuthFlow(code);
          
          // Remove listener
          listener.remove();
        }
      });
    } else {
      // Web: redirect as usual
      window.location.href = data.authUrl;
    }
  } catch (error) {
    console.error('OAuth start error:', error);
    setMessage(error.message);
  } finally {
    setConnecting(false);
  }
};

const completeOAuthFlow = async (code) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch('/.netlify/functions/ebay-oauth-callback', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error);

    toast.success('eBay connected successfully!');
    checkConnectionStatus(); // Refresh UI
  } catch (error) {
    console.error('OAuth completion error:', error);
    toast.error('Failed to complete eBay connection');
  }
};
```

**Similar changes needed for:**
- Instagram OAuth
- YouTube OAuth
- TikTok OAuth (when implemented)
- OneDrive OAuth

### 5.3 Backend OAuth Function Updates

**File:** `netlify/functions/ebay-oauth-start.js` (modify)

```javascript
exports.handler = async (event, context) => {
  // ... existing auth checks ...
  
  const body = JSON.parse(event.body || '{}');
  const platform = body.platform || 'web';
  const customRedirectUri = body.redirectUri;
  
  // Determine redirect URI based on platform
  let redirectUri;
  if (platform === 'mobile' && customRedirectUri) {
    // Mobile: use custom scheme or universal link
    redirectUri = customRedirectUri;
  } else {
    // Web: use standard callback URL
    redirectUri = `${process.env.FRONTEND_URL}/integrations`;
  }
  
  // Build eBay OAuth URL
  const authUrl = `https://auth.ebay.com/oauth2/authorize?` +
    `client_id=${process.env.EBAY_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(EBAY_SCOPES)}` +
    `&state=${userId}`; // Include user ID for security
  
  return {
    statusCode: 200,
    body: JSON.stringify({ authUrl })
  };
};
```

**New Function:** `netlify/functions/ebay-oauth-callback.js`

```javascript
// Handle OAuth callback code exchange
// Called from mobile app after deep link captures code

exports.handler = async (event, context) => {
  const { code } = JSON.parse(event.body);
  const userId = getUserIdFromAuth(event); // Extract from JWT
  
  // Exchange code for access token
  const tokenResponse = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${base64Encode(CLIENT_ID:CLIENT_SECRET)}`
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI // Must match what was used in oauth-start
    })
  });
  
  const tokens = await tokenResponse.json();
  
  // Save tokens to database
  await saveUserTokens(userId, tokens);
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
```

### 5.4 eBay Developer Account Configuration

**Update RuName (Redirect URL Name):**

1. Go to eBay Developer Portal → Your Application → User Tokens
2. Add new RuName for mobile:
   ```
   Name: OpSyncPro-Mobile
   Redirect URL: opsyncpro://oauth/callback
   ```
3. Add universal link as well:
   ```
   Name: OpSyncPro-Universal
   Redirect URL: https://app.opsyncpro.io/oauth/callback
   ```

**OAuth Scopes (unchanged):**
```
https://api.ebay.com/oauth/api_scope
https://api.ebay.com/oauth/api_scope/sell.inventory
https://api.ebay.com/oauth/api_scope/sell.marketing
https://api.ebay.com/oauth/api_scope/sell.account
```

### 5.5 Instagram/Facebook OAuth Changes

**Current:** Meta OAuth redirect to `https://app.opsyncpro.io/integrations?social=connected`

**Mobile Update:**

1. **Facebook Developer Console:**
   - App Settings → Add Platform → iOS / Android
   - Add custom URL scheme: `opsyncpro`
   - Add App Links URL: `https://app.opsyncpro.io`

2. **OAuth Settings:**
   ```
   Valid OAuth Redirect URIs:
   - https://app.opsyncpro.io/integrations
   - https://app.opsyncpro.io/oauth/callback
   - opsyncpro://oauth/callback
   ```

3. **Code changes:** Same pattern as eBay (use Browser plugin + deep link listener)

### 5.6 YouTube OAuth Changes

**Current:** Google OAuth redirect to web URL

**Mobile Update:**

1. **Google Cloud Console:**
   - APIs & Services → Credentials
   - OAuth 2.0 Client ID → Add redirect URI
   ```
   Authorized redirect URIs:
   - https://app.opsyncpro.io/integrations
   - https://app.opsyncpro.io/oauth/callback
   - opsyncpro://oauth/callback
   ```

2. **Code changes:** Same pattern as eBay

### 5.7 Universal Links / App Links Setup

**iOS Universal Links:**

Host this file: `https://app.opsyncpro.io/.well-known/apple-app-site-association`

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.io.opsyncpro.app",
        "paths": [
          "/oauth/*",
          "/auth/*",
          "/integrations"
        ]
      }
    ]
  }
}
```

**Android App Links:**

Host this file: `https://app.opsyncpro.io/.well-known/assetlinks.json`

```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "io.opsyncpro.app",
    "sha256_cert_fingerprints": [
      "YOUR_RELEASE_KEYSTORE_SHA256"
    ]
  }
}]
```

**Get Android SHA256 fingerprint:**
```bash
keytool -list -v -keystore opsyncpro-release.keystore -alias opsyncpro
```

---

## 6. Backend Changes Required

### 6.1 API Modifications

**No Breaking Changes:** The backend (Netlify Functions + Supabase) will continue to work for web users.

**New/Modified Endpoints:**

1. **OAuth Functions:**
   - ✅ Existing: `ebay-oauth-start.js`
   - ✏️ Modify: Accept `platform` and `redirectUri` parameters
   - ➕ New: `ebay-oauth-callback.js` (handle code exchange from mobile)
   - ✏️ Modify: `social-accounts-connect.js` (Instagram, YouTube)

2. **Push Notification Endpoints:**
   - ➕ New: `save-push-token.js`
   - ➕ New: `send-push-notification.js`

**File:** `netlify/functions/save-push-token.js`

```javascript
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
  // Verify user auth
  const userId = getUserIdFromAuth(event);
  
  const { token, platform } = JSON.parse(event.body);
  
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
  
  // Upsert push token
  const { error } = await supabase
    .from('user_push_tokens')
    .upsert({
      user_id: userId,
      token: token,
      platform: platform, // 'ios' or 'android'
      active: true,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id,platform'
    });
  
  if (error) throw error;
  
  return {
    statusCode: 200,
    body: JSON.stringify({ success: true })
  };
};
```

### 6.2 Database Schema Changes

**New Table:** `user_push_tokens`

```sql
CREATE TABLE user_push_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_push_tokens_user ON user_push_tokens(user_id);
CREATE INDEX idx_push_tokens_active ON user_push_tokens(active) WHERE active = true;
```

**RLS Policy:**
```sql
ALTER TABLE user_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push tokens"
  ON user_push_tokens
  FOR ALL
  USING (auth.uid() = user_id);
```

### 6.3 Push Notification Infrastructure

**Firebase Cloud Messaging (FCM) Setup:**

1. **Create Firebase Project:**
   - Go to https://console.firebase.google.com/
   - Create project: "OpSyncPro"

2. **Add Apps:**
   - Add iOS app: Bundle ID `io.opsyncpro.app`
   - Download `GoogleService-Info.plist` → place in `ios/App/App/`
   - Add Android app: Package name `io.opsyncpro.app`
   - Download `google-services.json` → place in `android/app/`

3. **Get Server Key:**
   - Project Settings → Cloud Messaging
   - Copy "Server key" → save as `FIREBASE_SERVER_KEY` in Netlify env vars

4. **iOS APNs Configuration:**
   - Upload APNs auth key to Firebase
   - Get from Apple Developer → Keys → Create new key (APNs)
   - Upload .p8 file to Firebase Project Settings → Cloud Messaging → iOS app

**Send Push Notification Function:**

**File:** `netlify/functions/send-push-notification.js`

```javascript
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK (once)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });
}

exports.handler = async (event, context) => {
  const { userId, title, body, data } = JSON.parse(event.body);
  
  // Get user's push tokens from database
  const tokens = await getUserPushTokens(userId);
  
  if (!tokens.length) {
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'No push tokens found' })
    };
  }
  
  // Send notifications
  const message = {
    notification: {
      title: title,
      body: body
    },
    data: data || {},
    tokens: tokens.map(t => t.token)
  };
  
  const response = await admin.messaging().sendMulticast(message);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      successCount: response.successCount,
      failureCount: response.failureCount
    })
  };
};
```

**Integration with Existing Features:**

**Example:** Price reduction notification

**File:** `netlify/functions/scheduled-price-reduction.js` (modify)

```javascript
// After successfully reducing price
await sendPushNotification({
  userId: listing.user_id,
  title: 'Price Reduced',
  body: `${listing.title} reduced to $${newPrice}`,
  data: {
    listingId: listing.id,
    action: 'view_listing'
  }
});
```

### 6.4 Environment Variables

**New Variables (Netlify):**
```bash
# Firebase (for push notifications)
FIREBASE_PROJECT_ID=opsyncpro
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@opsyncpro.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# iOS APNs (if not using FCM for iOS)
APNS_KEY_ID=ABC123DEF4
APNS_TEAM_ID=XYZ987UVW6
APNS_AUTH_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# OAuth redirect URIs (for reference)
OAUTH_REDIRECT_WEB=https://app.opsyncpro.io/integrations
OAUTH_REDIRECT_MOBILE=opsyncpro://oauth/callback
OAUTH_REDIRECT_UNIVERSAL=https://app.opsyncpro.io/oauth/callback
```

### 6.5 CORS Updates

**Current CORS headers** already allow mobile origins if using same domain.

**If needed, update:** `netlify/functions/_middleware.js` (or individual functions)

```javascript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Or specific: 'https://app.opsyncpro.io'
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
};

exports.handler = async (event, context) => {
  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders
    };
  }
  
  // ... rest of function
  
  return {
    statusCode: 200,
    headers: corsHeaders,
    body: JSON.stringify(data)
  };
};
```

### 6.6 No Changes Required (Already Mobile-Compatible)

✅ **Supabase Auth** - Works identically on mobile  
✅ **Supabase Database** - REST API works from any client  
✅ **Netlify Functions** - Stateless, platform-agnostic  
✅ **eBay API calls** - Server-side, no client changes needed  
✅ **Keepa API** - Backend integration, unchanged  
✅ **OneDrive API** - May need OAuth flow update (same as eBay pattern)

---

## Summary Checklist

### PWA Deployment
- [ ] Create `manifest.json` with all required fields
- [ ] Generate app icons (8 sizes: 72x72 to 512x512)
- [ ] Create service worker (`sw.js`)
- [ ] Register service worker in `main.jsx`
- [ ] Create offline fallback page
- [ ] Update `index.html` with PWA meta tags
- [ ] Test "Add to Home Screen" on iOS/Android
- [ ] Test offline functionality
- [ ] (Optional) Install `vite-plugin-pwa` for auto-generation

### Capacitor/Native App Deployment
- [ ] Install Capacitor dependencies (14 packages)
- [ ] Initialize Capacitor config
- [ ] Add iOS platform (`npx cap add ios`)
- [ ] Add Android platform (`npx cap add android`)
- [ ] Configure deep linking (iOS: Info.plist, Android: AndroidManifest.xml)
- [ ] Set up Universal Links / App Links
- [ ] Host `.well-known` files on domain
- [ ] Generate all app icons and splash screens
- [ ] Configure push notifications (Firebase FCM)
- [ ] Update OAuth flows for mobile deep linking
- [ ] Test camera permissions and functionality
- [ ] Create build scripts and update documentation

### iOS App Store
- [ ] Enroll in Apple Developer Program ($99/year)
- [ ] Create App ID in Developer Portal
- [ ] Enable capabilities (Push, Associated Domains)
- [ ] Generate Development and Distribution certificates
- [ ] Create provisioning profiles
- [ ] Configure Xcode project signing
- [ ] Update Info.plist with all permissions
- [ ] Create Privacy Manifest (iOS 17+)
- [ ] Generate all app icons (9 sizes)
- [ ] Create splash screen
- [ ] Create App Store listing in App Store Connect
- [ ] Prepare screenshots (3 sizes minimum)
- [ ] Write app description, keywords, etc.
- [ ] Archive and upload build
- [ ] Submit for review

### Android Google Play
- [ ] Create Google Play Console account ($25 one-time)
- [ ] Generate release keystore (BACKUP SECURELY)
- [ ] Configure signing in `build.gradle`
- [ ] Update AndroidManifest.xml with permissions
- [ ] Generate all app icons (5 densities + adaptive)
- [ ] Set up Firebase project for FCM
- [ ] Download `google-services.json`
- [ ] Build release AAB (`./gradlew bundleRelease`)
- [ ] Create app listing in Play Console
- [ ] Prepare screenshots (phone + tablet optional)
- [ ] Complete Data Safety form
- [ ] Complete Content Rating questionnaire
- [ ] Upload AAB and submit for review

### Backend Updates
- [ ] Modify OAuth functions to accept `platform` parameter
- [ ] Create new `oauth-callback` endpoints for mobile
- [ ] Create `user_push_tokens` table in Supabase
- [ ] Create `save-push-token` function
- [ ] Create `send-push-notification` function
- [ ] Set up Firebase Admin SDK
- [ ] Add Firebase credentials to Netlify env vars
- [ ] Update eBay/Instagram/YouTube developer console redirect URIs
- [ ] Test OAuth flows on mobile (iOS + Android)
- [ ] Integrate push notifications into existing features
- [ ] Update CORS headers if needed

### OAuth Provider Updates
- [ ] eBay: Add mobile redirect URIs to RuName
- [ ] Instagram: Add mobile platform to Facebook App Settings
- [ ] YouTube: Add mobile redirect URIs to Google OAuth client
- [ ] OneDrive: Add mobile redirect URIs to Azure AD app
- [ ] Test all OAuth flows end-to-end on mobile devices

---

## Development Timeline Estimate

**Phase 1: PWA (1-2 weeks)**
- Basic manifest and service worker
- Icon generation
- Testing

**Phase 2: Capacitor Setup (1-2 weeks)**
- Install and configure Capacitor
- Add native platforms
- Basic build and run

**Phase 3: Mobile OAuth (2-3 weeks)**
- Deep linking setup
- OAuth flow modifications
- Backend updates
- Testing all providers

**Phase 4: Push Notifications (1-2 weeks)**
- Firebase setup
- Backend integration
- Testing

**Phase 5: App Store Prep (2-3 weeks)**
- App Store Connect setup
- Screenshots and metadata
- Test builds
- Review preparation

**Phase 6: Google Play Prep (1-2 weeks)**
- Play Console setup
- Screenshots and metadata
- Release builds

**Phase 7: Submission & Launch (1-2 weeks)**
- Submit to both stores
- Respond to review feedback
- Monitor crashes/issues
- Iterate

**Total Estimated Time: 10-16 weeks** (with 1-2 developers)

---

**End of Technical Specification**
