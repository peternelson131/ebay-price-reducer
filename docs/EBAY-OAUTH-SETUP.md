# eBay Account Connection Guide

This guide walks you through connecting your eBay seller account to the eBay Price Reducer app.

## Overview

To create and manage listings on eBay, you need to:
1. Create an eBay Developer account
2. Create an application in the eBay Developer Console
3. Connect your application to this app

This is a one-time setup that takes about 10-15 minutes.

---

## Step 1: Create an eBay Developer Account

1. Go to [eBay Developer Program](https://developer.ebay.com/)
2. Click **"Join"** or **"Sign In"** (use your eBay seller account)
3. Complete the registration process

---

## Step 2: Create an Application

1. Once logged in, go to **[My Account → Application Keys](https://developer.ebay.com/my/keys)**
2. Click **"Create a Keyset"** (or use existing Production keys)
3. Choose **Production** environment (not Sandbox)
4. Give your application a name (e.g., "My Listing Manager")

---

## Step 3: Get Your Credentials

After creating the application, you'll see:
- **App ID (Client ID)** — Copy this
- **Cert ID (Client Secret)** — Click "Show" and copy this

⚠️ **Keep these credentials secure!** Never share them publicly.

---

## Step 4: Configure OAuth Settings in eBay

This is the critical step:

1. In eBay Developer Console, click on your application name
2. Go to **"User Tokens"** tab
3. Under **"OAuth Accepted URL"**, add this redirect URL:

   ```
   https://YOUR-APP-DOMAIN/.netlify/functions/ebay-oauth-callback
   ```

   Replace `YOUR-APP-DOMAIN` with your actual app URL (e.g., `dainty-horse-49c336.netlify.app`)

4. Save the settings

---

## Step 5: Connect in Our App

1. Go to **API Keys** page in our app
2. Find the **"eBay Account"** section
3. Enter your **Client ID** and **Client Secret**
4. Click **"Connect eBay Account"**
5. You'll be redirected to eBay to authorize the connection
6. After authorization, you'll return to our app
7. You should see **"✓ Connected"** status

---

## Troubleshooting

### "Invalid redirect URI" Error
- Make sure the redirect URL in eBay Developer Console exactly matches:
  `https://YOUR-APP-DOMAIN/.netlify/functions/ebay-oauth-callback`
- Don't include a trailing slash

### "Invalid scope" Error
- Your eBay Developer account may need to enable selling APIs
- Contact eBay Developer Support to enable sell.inventory scope

### "Token expired" Status
- This is normal! Tokens refresh automatically when you use the app
- If issues persist, click "Reconnect" to generate new tokens

### Connection Fails Repeatedly
1. Double-check your Client ID and Client Secret
2. Ensure you're using Production keys (not Sandbox)
3. Verify the redirect URL is configured in eBay
4. Try disconnecting and reconnecting

---

## Security Notes

- Your credentials are encrypted before storage
- We never store or see your eBay password
- You can disconnect your account at any time
- Access tokens expire every 2 hours and refresh automatically
- Refresh tokens are valid for 18 months

---

## Need Help?

If you're stuck, check:
1. [eBay Developer Documentation](https://developer.ebay.com/docs)
2. [eBay OAuth Guide](https://developer.ebay.com/api-docs/static/oauth-tokens.html)
