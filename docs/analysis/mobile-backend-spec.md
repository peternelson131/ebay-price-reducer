# OpsyncPro Mobile Backend Technical Specification

**Document Version:** 1.0  
**Date:** January 24, 2026  
**Author:** Backend Agent  
**Purpose:** Technical requirements for iOS/Android mobile app backend support

---

## Table of Contents

1. [Push Notification Infrastructure](#1-push-notification-infrastructure)
2. [OAuth Deep Linking](#2-oauth-deep-linking)
3. [Mobile-Specific Endpoints](#3-mobile-specific-endpoints)
4. [Supabase Configuration](#4-supabase-configuration)
5. [API Considerations](#5-api-considerations)

---

## 1. Push Notification Infrastructure

### 1.1 Firebase Cloud Messaging (FCM) Setup

#### NPM Dependencies to Add

```json
{
  "dependencies": {
    "firebase-admin": "^12.0.0"
  }
}
```

#### Environment Variables Required

```env
# Firebase Service Account (JSON key)
FIREBASE_PROJECT_ID=opsyncpro-mobile
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@opsyncpro-mobile.iam.gserviceaccount.com

# FCM Legacy Server Key (for fallback)
FCM_SERVER_KEY=AAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### Firebase Admin SDK Initialization

Create: `netlify/functions/utils/firebase-admin.js`

```javascript
const admin = require('firebase-admin');

let firebaseApp;

function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  const serviceAccount = {
    projectId: process.env.FIREBASE_PROJECT_ID,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  };

  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return firebaseApp;
}

module.exports = { getFirebaseApp };
```

### 1.2 Database Schema Changes

#### New Table: `device_tokens`

Create migration: `supabase/migrations/20260125_add_mobile_device_tokens.sql`

```sql
-- Device tokens for push notifications
CREATE TABLE device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Device identification
  device_id TEXT NOT NULL, -- Unique device identifier from app
  device_type TEXT NOT NULL CHECK (device_type IN ('ios', 'android')),
  device_name TEXT, -- e.g., "Pete's iPhone", "Samsung Galaxy S23"
  device_model TEXT, -- e.g., "iPhone 14 Pro", "SM-S918B"
  os_version TEXT, -- e.g., "17.2", "14"
  app_version TEXT, -- e.g., "1.0.0", "1.2.3"
  
  -- FCM token
  fcm_token TEXT NOT NULL UNIQUE,
  token_type TEXT DEFAULT 'fcm' CHECK (token_type IN ('fcm', 'apns')),
  
  -- Push notification preferences
  notifications_enabled BOOLEAN DEFAULT true,
  notification_categories JSONB DEFAULT '{
    "listings": true,
    "price_changes": true,
    "orders": true,
    "messages": true,
    "promotions": false,
    "system": true
  }'::jsonb,
  
  -- Status tracking
  is_active BOOLEAN DEFAULT true,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one active token per device
  UNIQUE(user_id, device_id)
);

-- Indexes
CREATE INDEX idx_device_tokens_user_active ON device_tokens(user_id, is_active) 
  WHERE is_active = true;
CREATE INDEX idx_device_tokens_fcm_token ON device_tokens(fcm_token);
CREATE INDEX idx_device_tokens_last_used ON device_tokens(last_used_at);

-- RLS Policies
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own devices"
  ON device_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can register their own devices"
  ON device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own devices"
  ON device_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own devices"
  ON device_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Auto-update timestamp trigger
CREATE TRIGGER update_device_tokens_updated_at 
  BEFORE UPDATE ON device_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Cleanup old inactive tokens (run monthly)
CREATE OR REPLACE FUNCTION cleanup_inactive_device_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Delete tokens not used in 90 days
  DELETE FROM device_tokens
  WHERE last_used_at < NOW() - INTERVAL '90 days'
    AND is_active = false;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

COMMENT ON TABLE device_tokens IS 'FCM tokens for mobile push notifications (iOS/Android)';
COMMENT ON COLUMN device_tokens.fcm_token IS 'Firebase Cloud Messaging registration token';
COMMENT ON COLUMN device_tokens.notification_categories IS 'User preferences for notification types';
```

#### Update `users` table for notification preferences

```sql
-- Add mobile notification preferences to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS 
  mobile_notifications_enabled BOOLEAN DEFAULT true;

ALTER TABLE users ADD COLUMN IF NOT EXISTS 
  notification_preferences JSONB DEFAULT '{
    "email": true,
    "push": true,
    "sms": false,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00",
    "timezone": "America/Chicago"
  }'::jsonb;

COMMENT ON COLUMN users.notification_preferences IS 'Global notification preferences including quiet hours';
```

### 1.3 Netlify Function: Send Push Notifications

Create: `netlify/functions/push-notification-send.js`

```javascript
/**
 * Send Push Notification to User Devices
 * POST /.netlify/functions/push-notification-send
 * 
 * Body: {
 *   userId: 'uuid',
 *   title: 'Notification Title',
 *   body: 'Notification body text',
 *   data?: { key: 'value' },
 *   category?: 'listings' | 'price_changes' | 'orders' | 'messages',
 *   priority?: 'normal' | 'high',
 *   sound?: 'default' | 'custom.wav'
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { getFirebaseApp } = require('./utils/firebase-admin');
const { verifyWebhookSecret } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  // This endpoint should only be called by backend services, not directly by users
  const authResult = verifyWebhookSecret(event);
  if (!authResult.success) {
    return {
      statusCode: authResult.statusCode,
      body: JSON.stringify({ error: authResult.error })
    };
  }

  try {
    const {
      userId,
      title,
      body,
      data = {},
      category = 'system',
      priority = 'normal',
      sound = 'default',
      imageUrl = null
    } = JSON.parse(event.body || '{}');

    if (!userId || !title || !body) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required fields: userId, title, body' 
        })
      };
    }

    // Get user's notification preferences
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('notification_preferences, mobile_notifications_enabled')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Check if user has push notifications enabled
    if (!user.mobile_notifications_enabled || !user.notification_preferences?.push) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: false, 
          reason: 'Push notifications disabled for user' 
        })
      };
    }

    // Check quiet hours
    const quietHours = user.notification_preferences;
    const userTz = quietHours?.timezone || 'America/Chicago';
    const now = new Date();
    // TODO: Implement quiet hours check using timezone

    // Get all active device tokens for user
    const { data: devices, error: devicesError } = await supabase
      .from('device_tokens')
      .select('fcm_token, device_type, notification_categories')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('notifications_enabled', true);

    if (devicesError) {
      throw new Error(`Failed to fetch devices: ${devicesError.message}`);
    }

    if (!devices || devices.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: false, 
          reason: 'No active devices registered' 
        })
      };
    }

    // Filter devices by notification category preference
    const eligibleDevices = devices.filter(device => {
      const prefs = device.notification_categories || {};
      return prefs[category] !== false; // Default to true if not set
    });

    if (eligibleDevices.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ 
          success: false, 
          reason: `No devices with ${category} notifications enabled` 
        })
      };
    }

    // Send FCM notifications
    const admin = getFirebaseApp();
    const messaging = admin.messaging();

    const fcmTokens = eligibleDevices.map(d => d.fcm_token);

    const message = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        category,
        timestamp: new Date().toISOString(),
      },
      android: {
        priority: priority === 'high' ? 'high' : 'normal',
        notification: {
          sound: sound,
          channelId: category, // Use category as channel ID
          priority: priority === 'high' ? 'high' : 'default',
          imageUrl: imageUrl || undefined
        }
      },
      apns: {
        headers: {
          'apns-priority': priority === 'high' ? '10' : '5',
        },
        payload: {
          aps: {
            alert: {
              title: title,
              body: body,
            },
            sound: sound,
            badge: 1, // Could be dynamic based on unread count
            category: category,
            'mutable-content': 1, // Enable notification extensions
          },
        },
      },
      tokens: fcmTokens,
    };

    const response = await messaging.sendEachForMulticast(message);

    // Handle failures and update token status
    const failedTokens = [];
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const errorCode = resp.error?.code;
        console.error(`FCM send failed for token ${idx}:`, errorCode);
        
        // Token is invalid/expired - mark for cleanup
        if (errorCode === 'messaging/invalid-registration-token' ||
            errorCode === 'messaging/registration-token-not-registered') {
          failedTokens.push(fcmTokens[idx]);
        }
      }
    });

    // Deactivate failed tokens
    if (failedTokens.length > 0) {
      await supabase
        .from('device_tokens')
        .update({ is_active: false })
        .in('fcm_token', failedTokens);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        sent: response.successCount,
        failed: response.failureCount,
        totalDevices: eligibleDevices.length,
        deactivatedTokens: failedTokens.length
      })
    };

  } catch (error) {
    console.error('Push notification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error.message || 'Failed to send push notification' 
      })
    };
  }
};
```

### 1.4 Events That Should Trigger Push Notifications

Based on existing backend functions, implement push notifications for:

#### High Priority Events

1. **Price Change Completed** (`process-price-reductions.js`)
   - When: After successful price update on eBay
   - Title: "Price Updated"
   - Body: "{item_title} reduced to ${new_price}"
   - Data: `{ listingId, oldPrice, newPrice, itemId }`
   - Category: `price_changes`

2. **eBay Listing Sold** (`sync-ebay-listings.js`)
   - When: Listing status changes to 'Completed'
   - Title: "Item Sold! 🎉"
   - Body: "{item_title} sold for ${price}"
   - Data: `{ listingId, price, buyerUsername }`
   - Category: `orders`

3. **New Message Received** (`instagram-webhook.js`)
   - When: Instagram DM webhook fires
   - Title: "New message from @{username}"
   - Body: Message preview (first 100 chars)
   - Data: `{ conversationId, messageId, platform: 'instagram' }`
   - Category: `messages`

#### Normal Priority Events

4. **Listing Ending Soon** (New scheduled job needed)
   - When: 24 hours before listing ends
   - Title: "Listing Ending Soon"
   - Body: "{item_title} ends in 24 hours"
   - Category: `listings`

5. **Sync Completed** (`sync-ebay-listings-scheduled.js`)
   - When: Scheduled sync finishes
   - Title: "Sync Complete"
   - Body: "Updated {count} listings"
   - Category: `system`

6. **Social Post Published** (`social-post-processor.js`)
   - When: Scheduled social post succeeds
   - Title: "Post Published"
   - Body: "Your video posted to {platform}"
   - Category: `listings`

7. **Order Shipped** (`aftership-webhook.js`)
   - When: Tracking shows shipment picked up
   - Title: "Order Shipped"
   - Body: "Tracking: {tracking_number}"
   - Category: `orders`

#### Implementation Pattern

Add to existing functions after successful operations:

```javascript
// Example: In process-price-reductions.js after reducing price
const notificationUrl = `${process.env.URL}/.netlify/functions/push-notification-send`;
await httpsPost(notificationUrl, {
  userId: listing.user_id,
  title: 'Price Updated',
  body: `${listing.title} reduced to $${newPrice}`,
  data: {
    listingId: listing.id,
    ebayItemId: listing.ebay_item_id,
    oldPrice: listing.current_price.toString(),
    newPrice: newPrice.toString(),
    action: 'view_listing'
  },
  category: 'price_changes',
  priority: 'normal'
}, {
  'X-Webhook-Secret': process.env.WEBHOOK_SECRET
});
```

---

## 2. OAuth Deep Linking

### 2.1 Current OAuth Callback Flows

#### Existing Web Callbacks

| Provider | Callback Function | Current Redirect |
|----------|------------------|------------------|
| eBay | `ebay-oauth-callback.js` | `{APP_URL}/integrations?ebay_connected=true` |
| Instagram | `instagram-callback.js` | `{FRONTEND_URL}/integrations?instagram=connected` |
| Meta/Facebook | `meta-callback.js` | `{FRONTEND_URL}/integrations?meta=connected` |
| TikTok | `tiktok-callback.js` | via `social-accounts-callback.js` |
| YouTube | `youtube-callback.js` | via `social-accounts-callback.js` |
| OneDrive | `onedrive-callback.js` | `{FRONTEND_URL}/integrations?onedrive=success` |

#### Current Redirect Pattern

All callbacks use HTTP 302 redirects:

```javascript
return {
  statusCode: 302,
  headers: { 
    'Location': `${FRONTEND_URL}/integrations?provider=connected`,
    'Cache-Control': 'no-cache'
  },
  body: ''
};
```

### 2.2 Mobile App Deep Link Scheme

#### App URL Schemes

```
iOS Universal Links: https://app.opsyncpro.com/oauth/callback
Android App Links:   https://app.opsyncpro.com/oauth/callback

Custom URL Scheme:   opsyncpro://oauth/callback
```

#### Deep Link Parameters

```
opsyncpro://oauth/callback?provider={provider}&status={status}&data={base64_json}

Examples:
- opsyncpro://oauth/callback?provider=ebay&status=success&account=jcsdirect
- opsyncpro://oauth/callback?provider=instagram&status=error&message=Access%20denied
- opsyncpro://oauth/callback?provider=meta&status=success&account=OpsyncPro%20Page
```

### 2.3 Backend Changes for Mobile Deep Links

#### Detect Platform from User-Agent or State

Update all OAuth callback functions to support mobile:

Create: `netlify/functions/utils/oauth-redirect.js`

```javascript
/**
 * Generate appropriate OAuth callback redirect based on platform
 * @param {Object} event - Netlify function event
 * @param {string} provider - OAuth provider (ebay, instagram, meta, etc.)
 * @param {Object} result - { success: boolean, data?: object, error?: string }
 * @returns {Object} Netlify function response (302 redirect)
 */
function generateOAuthRedirect(event, provider, result) {
  // Decode state to check for platform indicator
  const state = event.queryStringParameters?.state;
  let platform = 'web'; // default
  let returnTo = null;

  if (state) {
    try {
      const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
      platform = stateData.platform || 'web';
      returnTo = stateData.returnTo;
    } catch (e) {
      console.warn('Failed to decode state:', e);
    }
  }

  // Build redirect URL based on platform
  let redirectUrl;

  if (platform === 'ios' || platform === 'android' || platform === 'mobile') {
    // Mobile deep link
    const deepLinkBase = 'opsyncpro://oauth/callback';
    const params = new URLSearchParams({
      provider,
      status: result.success ? 'success' : 'error'
    });

    if (result.success && result.data) {
      // Encode success data
      params.set('data', Buffer.from(JSON.stringify(result.data)).toString('base64'));
    }

    if (!result.success && result.error) {
      params.set('message', result.error);
    }

    if (returnTo) {
      params.set('returnTo', returnTo);
    }

    redirectUrl = `${deepLinkBase}?${params.toString()}`;

    // For iOS Universal Links / Android App Links, use HTTPS fallback
    const universalLinkBase = process.env.UNIVERSAL_LINK_DOMAIN || 'https://app.opsyncpro.com';
    const universalLink = `${universalLinkBase}/oauth/callback?${params.toString()}`;

    // Return HTML with meta refresh and JavaScript fallback
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/html',
        'Cache-Control': 'no-cache'
      },
      body: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redirecting...</title>
  <meta http-equiv="refresh" content="0;url=${deepLinkBase}">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; text-align: center;">
  <h2>Redirecting to app...</h2>
  <p>If you're not redirected, <a href="${deepLinkBase}" id="deeplink">tap here</a>.</p>
  <script>
    // Try deep link first
    window.location.href = '${deepLinkBase}';
    
    // Fallback to universal link after 2 seconds
    setTimeout(function() {
      window.location.href = '${universalLink}';
    }, 2000);
    
    // Update link in case user needs to manually tap
    document.getElementById('deeplink').href = '${deepLinkBase}';
  </script>
</body>
</html>
      `
    };

  } else {
    // Web redirect (existing behavior)
    const webBase = process.env.URL || process.env.FRONTEND_URL || 'https://dainty-horse-49c336.netlify.app';
    const params = new URLSearchParams({
      [`${provider}`]: result.success ? 'connected' : 'error'
    });

    if (result.success && result.data?.account) {
      params.set('account', result.data.account);
    }

    if (!result.success && result.error) {
      params.set('message', result.error);
    }

    redirectUrl = `${webBase}/integrations?${params.toString()}`;

    return {
      statusCode: 302,
      headers: {
        'Location': redirectUrl,
        'Cache-Control': 'no-cache'
      },
      body: ''
    };
  }
}

module.exports = { generateOAuthRedirect };
```

#### Update All OAuth Callbacks

Example update for `ebay-oauth-callback.js`:

```javascript
const { generateOAuthRedirect } = require('./utils/oauth-redirect');

// Replace final redirect with:
// OLD:
// return {
//   statusCode: 302,
//   headers: { Location: successUrl },
//   body: ''
// };

// NEW:
return generateOAuthRedirect(event, 'ebay', {
  success: true,
  data: {
    account: user.ebay_user_id || 'Connected',
    expiresAt: expiresAt.toISOString()
  }
});

// Error case:
return generateOAuthRedirect(event, 'ebay', {
  success: false,
  error: error.message
});
```

Apply same pattern to:
- `instagram-callback.js`
- `meta-callback.js`
- `tiktok-callback.js`
- `youtube-callback.js`
- `onedrive-callback.js`
- `social-accounts-callback.js`

### 2.4 OAuth Start Flow Changes

Update `social-accounts-connect.js` and provider-specific auth start functions:

```javascript
// In social-accounts-connect.js
exports.handler = async (event, context) => {
  // ... existing auth verification ...

  const { platform, returnTo, appPlatform } = JSON.parse(event.body || '{}');

  // Generate state with platform indicator
  const state = crypto.randomBytes(32).toString('hex');
  
  // Store state with platform info
  const stateData = {
    user_id: userId,
    provider: platform,
    platform: appPlatform || 'web', // 'ios', 'android', or 'web'
    returnTo: returnTo || null,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };

  await supabase.from('oauth_states').insert({
    state,
    ...stateData
  });

  // Build auth URL (same as before)
  // ...
};
```

### 2.5 Universal Links (iOS) Configuration

iOS apps need `apple-app-site-association` file hosted at:

```
https://app.opsyncpro.com/.well-known/apple-app-site-association
```

Create: `netlify/functions/apple-app-site-association.js`

```javascript
/**
 * Serve Apple App Site Association for Universal Links
 * GET /.well-known/apple-app-site-association
 */

exports.handler = async (event, context) => {
  const config = {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${process.env.APPLE_TEAM_ID}.com.opsyncpro.mobile`,
          paths: [
            "/oauth/callback",
            "/oauth/callback/*",
            "/app/*"
          ]
        }
      ]
    },
    webcredentials: {
      apps: [`${process.env.APPLE_TEAM_ID}.com.opsyncpro.mobile`]
    }
  };

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    },
    body: JSON.stringify(config)
  };
};
```

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/.well-known/apple-app-site-association"
  to = "/.netlify/functions/apple-app-site-association"
  status = 200
```

### 2.6 App Links (Android) Configuration

Android apps need `assetlinks.json` file:

```
https://app.opsyncpro.com/.well-known/assetlinks.json
```

Create: `netlify/functions/assetlinks.js`

```javascript
/**
 * Serve Android Asset Links for App Links
 * GET /.well-known/assetlinks.json
 */

exports.handler = async (event, context) => {
  const config = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.opsyncpro.mobile",
        sha256_cert_fingerprints: [
          process.env.ANDROID_SHA256_CERT_FINGERPRINT
        ]
      }
    }
  ];

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600'
    },
    body: JSON.stringify(config)
  };
};
```

Add to `netlify.toml`:

```toml
[[redirects]]
  from = "/.well-known/assetlinks.json"
  to = "/.netlify/functions/assetlinks"
  status = 200
```

### 2.7 Supabase Auth Mobile Configuration

#### Supabase Dashboard Settings

Navigate to: **Authentication → URL Configuration**

Add redirect URLs:
```
opsyncpro://oauth/callback
https://app.opsyncpro.com/oauth/callback
https://app.opsyncpro.com/app/*
```

#### Supabase Auth Deep Links

Supabase Auth supports deep links for:
- Email verification
- Password reset
- Magic links

Update redirect URLs in Supabase email templates:

```html
<!-- Email Verification Template -->
<a href="opsyncpro://auth/verify?token={{ .Token }}&type=signup">
  Verify your email
</a>

<!-- Password Reset Template -->
<a href="opsyncpro://auth/reset?token={{ .Token }}">
  Reset your password
</a>
```

#### Handle Auth Callbacks in Mobile

Mobile apps should call:

```javascript
// After deep link callback with token
const { data, error } = await supabase.auth.verifyOtp({
  token_hash: token,
  type: 'signup' // or 'recovery', 'invite', 'magiclink'
});
```

---

## 3. Mobile-Specific Endpoints

### 3.1 Mobile Init Endpoint

**Purpose:** Batch load all necessary data for app launch (reduce API calls)

Create: `netlify/functions/mobile-init.js`

```javascript
/**
 * Mobile App Initialization Endpoint
 * POST /.netlify/functions/mobile-init
 * 
 * Returns all necessary data for app launch in a single request
 * 
 * Request Body:
 * {
 *   appVersion: "1.0.0",
 *   platform: "ios" | "android",
 *   deviceId: "unique-device-id"
 * }
 * 
 * Response:
 * {
 *   user: { ... },
 *   listings: [ ... ],
 *   socialAccounts: [ ... ],
 *   deviceToken: { ... },
 *   notificationPreferences: { ... },
 *   syncStatus: { ... },
 *   features: { ... }
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;

  const headers = getCorsHeaders(event);

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  // Verify authentication
  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }

  const userId = authResult.userId;

  try {
    const { appVersion, platform, deviceId } = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!appVersion || !platform || !deviceId) {
      return errorResponse(400, 'Missing required fields: appVersion, platform, deviceId', headers);
    }

    // Fetch all data in parallel
    const [
      userResult,
      listingsResult,
      socialAccountsResult,
      deviceTokenResult,
      scheduledPostsResult,
      recentPriceChangesResult,
      syncJobsResult
    ] = await Promise.allSettled([
      // User profile
      supabase
        .from('users')
        .select('id, email, name, ebay_user_id, ebay_credentials_valid, notification_preferences, mobile_notifications_enabled, subscription_plan')
        .eq('id', userId)
        .single(),

      // Active listings (limit to 100 most recent)
      supabase
        .from('listings')
        .select('id, ebay_item_id, title, current_price, image_urls, listing_status, view_count, watch_count, next_price_reduction, price_reduction_enabled')
        .eq('user_id', userId)
        .eq('listing_status', 'Active')
        .order('created_at', { ascending: false })
        .limit(100),

      // Connected social accounts
      supabase
        .from('social_accounts')
        .select('id, platform, username, account_metadata, is_active, connected_at')
        .eq('user_id', userId)
        .eq('is_active', true),

      // Current device token status
      supabase
        .from('device_tokens')
        .select('id, device_id, fcm_token, notifications_enabled, notification_categories, last_used_at')
        .eq('user_id', userId)
        .eq('device_id', deviceId)
        .eq('is_active', true)
        .maybeSingle(),

      // Upcoming scheduled posts
      supabase
        .from('social_posts')
        .select('id, caption, scheduled_at, platforms, status')
        .eq('user_id', userId)
        .in('status', ['scheduled', 'processing'])
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10),

      // Recent price changes (last 7 days)
      supabase
        .from('price_history')
        .select(`
          id,
          price,
          reason,
          created_at,
          listing:listings!inner(
            id,
            title,
            ebay_item_id
          )
        `)
        .eq('listings.user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(50),

      // Recent sync jobs
      supabase
        .from('sync_jobs')
        .select('id, status, started_at, completed_at, metadata')
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .limit(5)
    ]);

    // Extract data or use defaults
    const user = userResult.status === 'fulfilled' ? userResult.value.data : null;
    const listings = listingsResult.status === 'fulfilled' ? listingsResult.value.data : [];
    const socialAccounts = socialAccountsResult.status === 'fulfilled' ? socialAccountsResult.value.data : [];
    const deviceToken = deviceTokenResult.status === 'fulfilled' ? deviceTokenResult.value.data : null;
    const scheduledPosts = scheduledPostsResult.status === 'fulfilled' ? scheduledPostsResult.value.data : [];
    const recentPriceChanges = recentPriceChangesResult.status === 'fulfilled' ? recentPriceChangesResult.value.data : [];
    const syncJobs = syncJobsResult.status === 'fulfilled' ? syncJobsResult.value.data : [];

    // Calculate summary stats
    const stats = {
      activeListings: listings.length,
      totalViews: listings.reduce((sum, l) => sum + (l.view_count || 0), 0),
      totalWatchers: listings.reduce((sum, l) => sum + (l.watch_count || 0), 0),
      priceReductionsEnabled: listings.filter(l => l.price_reduction_enabled).length,
      connectedPlatforms: socialAccounts.length,
      upcomingPosts: scheduledPosts.length,
      recentPriceChanges: recentPriceChanges.length
    };

    // Feature flags (can be dynamic based on subscription plan)
    const features = {
      pushNotifications: true,
      socialPosting: true,
      priceAutomation: true,
      analytics: user?.subscription_plan === 'premium',
      unlimitedListings: user?.subscription_plan === 'premium',
      prioritySupport: user?.subscription_plan === 'premium'
    };

    // Check for critical errors
    const errors = [];
    if (!user) errors.push('Failed to load user profile');
    if (!user?.ebay_credentials_valid) errors.push('eBay credentials expired');

    // Last sync status
    const lastSync = syncJobs.length > 0 ? syncJobs[0] : null;
    const syncStatus = lastSync ? {
      status: lastSync.status,
      lastSyncAt: lastSync.completed_at || lastSync.started_at,
      listingsUpdated: lastSync.metadata?.updated_count || 0
    } : null;

    return successResponse({
      user: {
        id: user?.id,
        email: user?.email,
        name: user?.name,
        ebayConnected: user?.ebay_credentials_valid || false,
        ebayUserId: user?.ebay_user_id,
        subscriptionPlan: user?.subscription_plan || 'free',
        notificationPreferences: user?.notification_preferences
      },
      listings: listings.map(l => ({
        id: l.id,
        ebayItemId: l.ebay_item_id,
        title: l.title,
        price: l.current_price,
        imageUrl: l.image_urls?.[0] || null,
        status: l.listing_status,
        views: l.view_count,
        watchers: l.watch_count,
        nextReduction: l.next_price_reduction,
        autoReduceEnabled: l.price_reduction_enabled
      })),
      socialAccounts: socialAccounts.map(sa => ({
        id: sa.id,
        platform: sa.platform,
        username: sa.username,
        avatar: sa.account_metadata?.avatar_url || sa.account_metadata?.profile_image,
        connectedAt: sa.connected_at
      })),
      deviceToken: deviceToken ? {
        registered: true,
        notificationsEnabled: deviceToken.notifications_enabled,
        categories: deviceToken.notification_categories,
        lastUsed: deviceToken.last_used_at
      } : {
        registered: false
      },
      scheduledPosts: scheduledPosts.map(sp => ({
        id: sp.id,
        caption: sp.caption?.substring(0, 100) + (sp.caption?.length > 100 ? '...' : ''),
        scheduledAt: sp.scheduled_at,
        platforms: sp.platforms,
        status: sp.status
      })),
      stats,
      syncStatus,
      features,
      errors: errors.length > 0 ? errors : null,
      timestamp: new Date().toISOString(),
      serverVersion: '1.0.0'
    }, headers);

  } catch (error) {
    console.error('Mobile init error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
```

### 3.2 Device Registration Endpoint

Create: `netlify/functions/device-register.js`

```javascript
/**
 * Register Mobile Device for Push Notifications
 * POST /.netlify/functions/device-register
 * 
 * Body: {
 *   deviceId: "unique-device-identifier",
 *   fcmToken: "firebase-token",
 *   deviceType: "ios" | "android",
 *   deviceName: "Pete's iPhone",
 *   deviceModel: "iPhone 14 Pro",
 *   osVersion: "17.2",
 *   appVersion: "1.0.0",
 *   notificationCategories?: { ... }
 * }
 */

const { createClient } = require('@supabase/supabase-js');
const { getCorsHeaders, handlePreflight, errorResponse, successResponse } = require('./utils/cors');
const { verifyAuth } = require('./utils/auth');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event, context) => {
  const preflightResponse = handlePreflight(event);
  if (preflightResponse) return preflightResponse;

  const headers = getCorsHeaders(event);

  if (event.httpMethod !== 'POST') {
    return errorResponse(405, 'Method not allowed', headers);
  }

  const authResult = await verifyAuth(event);
  if (!authResult.success) {
    return errorResponse(authResult.statusCode, authResult.error, headers);
  }

  const userId = authResult.userId;

  try {
    const {
      deviceId,
      fcmToken,
      deviceType,
      deviceName,
      deviceModel,
      osVersion,
      appVersion,
      notificationCategories
    } = JSON.parse(event.body || '{}');

    // Validate required fields
    if (!deviceId || !fcmToken || !deviceType) {
      return errorResponse(400, 'Missing required fields: deviceId, fcmToken, deviceType', headers);
    }

    if (!['ios', 'android'].includes(deviceType)) {
      return errorResponse(400, 'deviceType must be "ios" or "android"', headers);
    }

    // Upsert device token
    const { data: device, error: upsertError } = await supabase
      .from('device_tokens')
      .upsert({
        user_id: userId,
        device_id: deviceId,
        device_type: deviceType,
        device_name: deviceName || null,
        device_model: deviceModel || null,
        os_version: osVersion || null,
        app_version: appVersion || null,
        fcm_token: fcmToken,
        notification_categories: notificationCategories || {
          listings: true,
          price_changes: true,
          orders: true,
          messages: true,
          promotions: false,
          system: true
        },
        notifications_enabled: true,
        is_active: true,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,device_id',
        returning: 'representation'
      })
      .select()
      .single();

    if (upsertError) {
      throw new Error(`Failed to register device: ${upsertError.message}`);
    }

    return successResponse({
      success: true,
      device: {
        id: device.id,
        deviceId: device.device_id,
        deviceType: device.device_type,
        notificationsEnabled: device.notifications_enabled,
        categories: device.notification_categories,
        registeredAt: device.registered_at,
        lastUsedAt: device.last_used_at
      }
    }, headers);

  } catch (error) {
    console.error('Device registration error:', error);
    return errorResponse(500, error.message || 'Internal server error', headers);
  }
};
```

### 3.3 Endpoints That Need Mobile-Specific Handling

#### 3.3.1 Sync Listings - Add Progress Updates

Update `sync-ebay-listings.js`:

```javascript
// Add progress callback for mobile apps
async function syncWithProgress(userId, progressCallback) {
  // Existing sync logic...
  
  // After each batch:
  if (progressCallback) {
    await progressCallback({
      total: totalListings,
      synced: syncedCount,
      percent: Math.round((syncedCount / totalListings) * 100)
    });
  }
}

// For mobile requests, send real-time progress via webhook or SSE
```

#### 3.3.2 Image Upload - Support Mobile Camera

Update `thumbnail-templates.js` and related image functions:

```javascript
// Accept base64 images from mobile camera
if (body.imageData && body.imageData.startsWith('data:image/')) {
  const base64Data = body.imageData.split(',')[1];
  const buffer = Buffer.from(base64Data, 'base64');
  // Process image...
}
```

#### 3.3.3 Video Upload - Mobile Recording Support

Create: `netlify/functions/mobile-video-upload.js`

```javascript
/**
 * Mobile Video Upload with Chunked Upload Support
 * POST /.netlify/functions/mobile-video-upload
 * 
 * Supports:
 * - Direct base64 upload (small videos < 10MB)
 * - Chunked uploads (large videos)
 * - Pre-signed upload URLs for direct-to-storage
 */

// Implementation similar to onedrive-upload-session.js
// but optimized for mobile bandwidth considerations
```

---

## 4. Supabase Configuration

### 4.1 Mobile Auth Setup

#### Supabase Dashboard Configuration

**Authentication → Providers → Email**

Enable:
- ✅ Email confirmations
- ✅ Secure email change
- ✅ Secure password change

**Authentication → Email Templates**

Update all templates with deep links:

```html
<!-- Confirm Signup -->
<h2>Confirm your email</h2>
<p>Click the link below to confirm your email address:</p>
<a href="opsyncpro://auth/verify?token={{ .Token }}&type=signup&redirect_to={{ .RedirectTo }}">
  Confirm Email
</a>
<p>Or use this link in a browser:</p>
<a href="{{ .SiteURL }}/auth/verify?token={{ .Token }}&type=signup">
  {{ .SiteURL }}/auth/verify
</a>
```

```html
<!-- Reset Password -->
<h2>Reset your password</h2>
<p>Click the link below to reset your password:</p>
<a href="opsyncpro://auth/reset?token={{ .Token }}&redirect_to={{ .RedirectTo }}">
  Reset Password
</a>
<p>Or use this link in a browser:</p>
<a href="{{ .SiteURL }}/auth/reset?token={{ .Token }}">
  {{ .SiteURL }}/auth/reset
</a>
```

#### Redirect URL Allowlist

**Authentication → URL Configuration**

Add:
```
opsyncpro://**
https://app.opsyncpro.com/**
http://localhost:19006/** (for Expo dev)
```

### 4.2 Deep Link Configuration

#### Custom SMTP Headers (Optional)

For mobile email clients to recognize deep links:

**Settings → Auth → Email**

Configure SMTP with:
```
X-Entity-Ref-ID: opsyncpro-auth
```

### 4.3 Row Level Security (RLS) Changes

#### Device Tokens Table

Already included in schema above. No additional RLS needed.

#### Social Accounts - Mobile Access

Ensure mobile apps can read encrypted tokens (they won't - tokens should only be used server-side):

```sql
-- social_accounts RLS is already correct
-- Mobile apps should NEVER receive access_token or refresh_token directly
-- They should call backend endpoints which use service role
```

#### Add RLS for Background Sync Jobs

```sql
-- Allow users to view their own sync jobs
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sync jobs"
  ON sync_jobs FOR SELECT
  USING (auth.uid() = user_id);
```

### 4.4 Database Functions for Mobile

#### Function: Get Unread Notification Count

```sql
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  count INTEGER;
BEGIN
  -- If you add a notifications table in the future
  SELECT COUNT(*)::INTEGER INTO count
  FROM notifications
  WHERE user_id = p_user_id
    AND read_at IS NULL;
  
  RETURN count;
END;
$$;
```

#### Function: Batch Update Listings

```sql
CREATE OR REPLACE FUNCTION mobile_batch_update_listings(
  p_user_id UUID,
  p_listing_ids UUID[],
  p_updates JSONB
)
RETURNS TABLE (
  updated_count INTEGER,
  failed_count INTEGER,
  errors JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count INTEGER := 0;
  v_failed_count INTEGER := 0;
  v_errors JSONB := '[]'::jsonb;
BEGIN
  -- Batch update listings with error handling
  -- Useful for mobile "select multiple and apply action"
  
  FOREACH listing_id IN ARRAY p_listing_ids LOOP
    BEGIN
      UPDATE listings
      SET
        price_reduction_enabled = COALESCE((p_updates->>'price_reduction_enabled')::boolean, price_reduction_enabled),
        reduction_percentage = COALESCE((p_updates->>'reduction_percentage')::integer, reduction_percentage),
        minimum_price = COALESCE((p_updates->>'minimum_price')::decimal, minimum_price),
        updated_at = NOW()
      WHERE id = listing_id
        AND user_id = p_user_id;
      
      v_updated_count := v_updated_count + 1;
      
    EXCEPTION WHEN OTHERS THEN
      v_failed_count := v_failed_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'listing_id', listing_id,
        'error', SQLERRM
      );
    END;
  END LOOP;
  
  RETURN QUERY SELECT v_updated_count, v_failed_count, v_errors;
END;
$$;
```

---

## 5. API Considerations

### 5.1 Response Format Changes

#### Mobile-Optimized Responses

No breaking changes needed, but add mobile-friendly fields:

```javascript
// Example: listings endpoint response
{
  "listings": [...],
  "pagination": {
    "page": 1,
    "perPage": 50,
    "total": 234,
    "hasMore": true,
    "nextCursor": "eyJpZCI6IjEyMyJ9" // for cursor-based pagination
  },
  "meta": {
    "requestId": "req_abc123",
    "timestamp": "2026-01-24T22:00:00Z",
    "serverVersion": "1.0.0"
  }
}
```

#### Image URLs - Mobile Optimization

Add image transformation parameters for mobile:

```javascript
// In listing responses, provide multiple image sizes
{
  "imageUrl": "https://cdn.opsyncpro.com/listing/abc123.jpg",
  "images": {
    "thumbnail": "https://cdn.opsyncpro.com/listing/abc123_thumb.jpg", // 150x150
    "small": "https://cdn.opsyncpro.com/listing/abc123_small.jpg",     // 300x300
    "medium": "https://cdn.opsyncpro.com/listing/abc123_medium.jpg",   // 600x600
    "large": "https://cdn.opsyncpro.com/listing/abc123_large.jpg"      // 1200x1200
  }
}
```

Implement in `get-thumbnail.js` or similar:

```javascript
// Add size parameter support
const size = event.queryStringParameters?.size || 'medium';
const dimensions = {
  thumbnail: 150,
  small: 300,
  medium: 600,
  large: 1200
};

// Use Sharp to resize
const resized = await sharp(imageBuffer)
  .resize(dimensions[size], dimensions[size], {
    fit: 'inside',
    withoutEnlargement: true
  })
  .jpeg({ quality: 85 })
  .toBuffer();
```

### 5.2 Rate Limiting for Mobile

#### Implement Rate Limiting Middleware

Create: `netlify/functions/utils/rate-limit.js`

```javascript
/**
 * Rate limiting for mobile endpoints
 * Uses Supabase to track request counts
 */

const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Check rate limit for user
 * @param {string} userId - User ID
 * @param {string} endpoint - Endpoint name (e.g., 'sync-listings')
 * @param {number} limit - Max requests per window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Object} { allowed: boolean, remaining: number, resetAt: Date }
 */
async function checkRateLimit(userId, endpoint, limit = 60, windowSeconds = 60) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowSeconds * 1000);

  // Count recent requests
  const { count, error } = await supabase
    .from('api_requests')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart.toISOString());

  if (error) {
    console.error('Rate limit check error:', error);
    // Allow on error to avoid blocking users
    return { allowed: true, remaining: limit, resetAt: new Date(now.getTime() + windowSeconds * 1000) };
  }

  const requestCount = count || 0;
  const allowed = requestCount < limit;
  const remaining = Math.max(0, limit - requestCount);
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);

  // Record this request if allowed
  if (allowed) {
    await supabase.from('api_requests').insert({
      user_id: userId,
      endpoint: endpoint,
      created_at: now.toISOString()
    });
  }

  return { allowed, remaining, resetAt };
}

/**
 * Create rate limit response headers
 */
function getRateLimitHeaders(remaining, resetAt) {
  return {
    'X-RateLimit-Remaining': remaining.toString(),
    'X-RateLimit-Reset': Math.floor(resetAt.getTime() / 1000).toString()
  };
}

module.exports = { checkRateLimit, getRateLimitHeaders };
```

#### Rate Limit Database Table

```sql
-- API request tracking for rate limiting
CREATE TABLE IF NOT EXISTS api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient rate limit queries
CREATE INDEX idx_api_requests_user_endpoint_time 
  ON api_requests(user_id, endpoint, created_at DESC);

-- Cleanup old requests (run daily)
CREATE OR REPLACE FUNCTION cleanup_old_api_requests()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM api_requests
  WHERE created_at < NOW() - INTERVAL '24 hours';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- RLS
ALTER TABLE api_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service can manage api_requests"
  ON api_requests FOR ALL
  USING (true); -- Service role only
```

#### Apply Rate Limiting to Endpoints

```javascript
// In sync-ebay-listings.js and other resource-intensive endpoints
const { checkRateLimit, getRateLimitHeaders } = require('./utils/rate-limit');

exports.handler = async (event, context) => {
  // ... auth verification ...

  // Check rate limit: 10 syncs per hour
  const rateLimit = await checkRateLimit(userId, 'sync-listings', 10, 3600);

  const headers = {
    ...getCorsHeaders(event),
    ...getRateLimitHeaders(rateLimit.remaining, rateLimit.resetAt)
  };

  if (!rateLimit.allowed) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil((rateLimit.resetAt - new Date()) / 1000)
      })
    };
  }

  // ... continue with sync ...
};
```

#### Recommended Rate Limits

| Endpoint | Limit | Window | Reason |
|----------|-------|--------|--------|
| `mobile-init` | 30/min | 60s | Prevent excessive app restarts |
| `sync-ebay-listings` | 10/hour | 3600s | eBay API rate limits |
| `device-register` | 5/min | 60s | Prevent token spam |
| `push-notification-send` | 100/hour | 3600s | Internal only (webhook) |
| `social-post` | 20/hour | 3600s | Platform rate limits |
| `listings` (GET) | 60/min | 60s | Standard read operations |
| `listings` (POST/PUT) | 30/min | 60s | Write operations |

### 5.3 Offline Sync Support Requirements

#### Client-Side Strategy

Mobile apps should implement:
1. **Local SQLite database** - Cache listings, posts, user data
2. **Queue system** - Queue writes when offline
3. **Conflict resolution** - Last-write-wins or server-wins

#### Backend Requirements

##### 1. ETags for Conditional Requests

Add to all GET endpoints:

```javascript
// Calculate ETag from data
const crypto = require('crypto');
const dataHash = crypto
  .createHash('md5')
  .update(JSON.stringify(responseData))
  .digest('hex');

const etag = `"${dataHash}"`;

// Check If-None-Match header
const clientEtag = event.headers['if-none-match'];
if (clientEtag === etag) {
  return {
    statusCode: 304,
    headers: {
      'ETag': etag,
      'Cache-Control': 'private, max-age=300'
    },
    body: ''
  };
}

// Return data with ETag
return {
  statusCode: 200,
  headers: {
    'ETag': etag,
    'Cache-Control': 'private, max-age=300'
  },
  body: JSON.stringify(responseData)
};
```

##### 2. Last-Modified Timestamps

Ensure all tables have `updated_at`:

```sql
-- Already exists on most tables
-- Add where missing
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS 
  updated_at TIMESTAMPTZ DEFAULT NOW();

-- Trigger to auto-update
CREATE TRIGGER update_social_posts_updated_at 
  BEFORE UPDATE ON social_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

Mobile apps can use:
```
GET /listings?modified_since=2026-01-24T20:00:00Z
```

Add filter to endpoints:

```javascript
const { modifiedSince } = event.queryStringParameters || {};

let query = supabase.from('listings').select('*').eq('user_id', userId);

if (modifiedSince) {
  query = query.gte('updated_at', modifiedSince);
}

const { data, error } = await query;
```

##### 3. Conflict Detection

Add version field to key tables:

```sql
-- Add version column for optimistic locking
ALTER TABLE listings ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Increment on update
CREATE OR REPLACE FUNCTION increment_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER increment_listings_version
  BEFORE UPDATE ON listings
  FOR EACH ROW EXECUTE FUNCTION increment_version();
```

Mobile apps send version in update requests:

```javascript
// Mobile sends
{
  "id": "listing-uuid",
  "version": 3,
  "updates": { "title": "New Title" }
}

// Backend checks version
const { data: listing } = await supabase
  .from('listings')
  .select('version')
  .eq('id', id)
  .single();

if (listing.version !== requestVersion) {
  return {
    statusCode: 409, // Conflict
    body: JSON.stringify({
      error: 'Version conflict',
      currentVersion: listing.version,
      requestedVersion: requestVersion
    })
  };
}
```

##### 4. Batch Sync Endpoint

Create: `netlify/functions/mobile-batch-sync.js`

```javascript
/**
 * Batch Sync - Upload offline changes
 * POST /.netlify/functions/mobile-batch-sync
 * 
 * Body: {
 *   operations: [
 *     { type: 'update', table: 'listings', id: 'uuid', data: {...}, version: 2 },
 *     { type: 'insert', table: 'device_tokens', data: {...} },
 *     { type: 'delete', table: 'listings', id: 'uuid' }
 *   ]
 * }
 * 
 * Response: {
 *   results: [
 *     { success: true, id: 'uuid', newVersion: 3 },
 *     { success: false, id: 'uuid', error: 'Version conflict' }
 *   ]
 * }
 */

// Implementation handles atomic operations with rollback on critical failures
```

---

## Summary of Implementation Steps

### Phase 1: Push Notifications (Week 1)
1. ✅ Add `firebase-admin` to package.json
2. ✅ Create `device_tokens` table migration
3. ✅ Implement `device-register.js` endpoint
4. ✅ Create `push-notification-send.js` function
5. ✅ Add Firebase environment variables to Netlify
6. ✅ Update 3-5 key functions to send notifications (start with price reductions)

### Phase 2: OAuth Deep Linking (Week 2)
1. ✅ Create `oauth-redirect.js` utility
2. ✅ Update all OAuth callback functions (6 files)
3. ✅ Modify OAuth start functions to accept platform parameter
4. ✅ Create Apple App Site Association endpoint
5. ✅ Create Android Asset Links endpoint
6. ✅ Update Supabase redirect URLs
7. ✅ Test deep links with mobile dev builds

### Phase 3: Mobile Endpoints (Week 3)
1. ✅ Create `mobile-init.js` batch endpoint
2. ✅ Create `sync_jobs` table for tracking
3. ✅ Add rate limiting middleware
4. ✅ Create `api_requests` table
5. ✅ Apply rate limiting to key endpoints
6. ✅ Add image size optimization to media endpoints

### Phase 4: Offline Sync (Week 4)
1. ✅ Add `version` columns to key tables
2. ✅ Implement ETag support in GET endpoints
3. ✅ Add `modified_since` query parameter support
4. ✅ Create `mobile-batch-sync.js` endpoint
5. ✅ Test conflict resolution flows

---

## Environment Variables Summary

New variables needed in Netlify:

```env
# Firebase Cloud Messaging
FIREBASE_PROJECT_ID=opsyncpro-mobile
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@opsyncpro-mobile.iam.gserviceaccount.com

# Universal/App Links
UNIVERSAL_LINK_DOMAIN=https://app.opsyncpro.com
APPLE_TEAM_ID=ABC123XYZ
ANDROID_SHA256_CERT_FINGERPRINT=AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99

# Already exists (verify)
WEBHOOK_SECRET=your-webhook-secret-here
```

---

## Testing Checklist

### Push Notifications
- [ ] Device registers successfully
- [ ] Notification sent when price changes
- [ ] Notification sent when item sells
- [ ] Notification respects quiet hours
- [ ] Notification category filtering works
- [ ] Invalid tokens are deactivated
- [ ] iOS badge count updates
- [ ] Android notification channels configured

### OAuth Deep Linking
- [ ] Web OAuth still works
- [ ] iOS deep link opens app
- [ ] Android deep link opens app
- [ ] Universal link fallback works
- [ ] Error handling with deep links
- [ ] State parameter preserves platform

### Mobile Init
- [ ] Returns all data in single request
- [ ] Response time < 2 seconds
- [ ] Handles missing data gracefully
- [ ] Stats are accurate

### Rate Limiting
- [ ] Rate limit headers present
- [ ] 429 status on exceed
- [ ] Per-user limits enforced
- [ ] Window resets correctly

### Offline Sync
- [ ] ETag 304 responses work
- [ ] Modified-since filtering works
- [ ] Version conflicts detected
- [ ] Batch sync handles failures

---

## Files to Create

1. `netlify/functions/utils/firebase-admin.js`
2. `netlify/functions/utils/oauth-redirect.js`
3. `netlify/functions/utils/rate-limit.js`
4. `netlify/functions/push-notification-send.js`
5. `netlify/functions/device-register.js`
6. `netlify/functions/mobile-init.js`
7. `netlify/functions/mobile-batch-sync.js`
8. `netlify/functions/mobile-video-upload.js`
9. `netlify/functions/apple-app-site-association.js`
10. `netlify/functions/assetlinks.js`
11. `supabase/migrations/20260125_add_mobile_device_tokens.sql`
12. `supabase/migrations/20260125_add_api_requests_table.sql`
13. `supabase/migrations/20260125_add_sync_jobs_table.sql`
14. `supabase/migrations/20260125_add_version_columns.sql`

## Files to Modify

1. `netlify/functions/ebay-oauth-callback.js` - Add mobile redirect
2. `netlify/functions/instagram-callback.js` - Add mobile redirect
3. `netlify/functions/meta-callback.js` - Add mobile redirect
4. `netlify/functions/tiktok-callback.js` - Add mobile redirect
5. `netlify/functions/youtube-callback.js` - Add mobile redirect
6. `netlify/functions/onedrive-callback.js` - Add mobile redirect
7. `netlify/functions/social-accounts-connect.js` - Accept platform param
8. `netlify/functions/process-price-reductions.js` - Send push notification
9. `netlify/functions/sync-ebay-listings.js` - Send push notification, rate limit
10. `netlify/functions/instagram-webhook.js` - Send push notification
11. `netlify/functions/aftership-webhook.js` - Send push notification
12. `netlify/functions/social-post-processor.js` - Send push notification
13. `netlify/functions/package.json` - Add firebase-admin
14. `netlify.toml` - Add redirect rules for .well-known

---

**End of Technical Specification**

*This document provides complete implementation details for mobile backend support. No cost estimates included per requirements.*
