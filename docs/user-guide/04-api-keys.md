# API Keys Page

## Purpose

The API Keys page is where you connect external services that power the eBay Price Reducer. The most important connection is your **eBay seller account**.

## Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│ API Keys                                                    │
│ Manage your API credentials for external services           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 🏷️ eBay Account                                         │ │
│ │ Connect your eBay seller account                        │ │
│ │                                        [✓] Connected    │ │
│ │                                                         │ │
│ │ [Disconnect eBay Account]                               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 📊 Keepa                                                │ │
│ │ Required for product data and variations                │ │
│ │                                        [✓] Active       │ │
│ │                                                         │ │
│ │ [••••••••••••••••••••••••••]  [Save] [Delete]           │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 🔒 Security Note                                            │
│ Your API keys are encrypted at rest and only used to make   │
│ requests on your behalf.                                    │
└─────────────────────────────────────────────────────────────┘
```

## eBay Account Connection

### Why Connect?

Connecting your eBay account allows the app to:
- Import your existing listings
- Create new listings on your behalf
- Update prices automatically
- Sync inventory changes

### How to Connect

1. Click **Connect eBay Account**
2. A popup opens to eBay's authorization page
3. Log in to your eBay seller account
4. Click "I agree" to grant permissions
5. Window closes automatically
6. Status changes to "Connected" ✓

### Permissions Requested

The app requests the following eBay permissions:
- `sell.inventory` - Create and manage inventory items
- `sell.account` - Access business policies

### Disconnecting

Click **Disconnect eBay Account** to revoke access. This will:
- Remove stored eBay tokens
- Stop automatic syncing
- Keep your existing listing data (but won't update)

## Keepa API Key

### Why Needed?

Keepa provides Amazon product data used for:
- Quick List - fetching product info from ASINs
- Product images and descriptions
- UPC/EAN codes for eBay listings

### Getting a Keepa API Key

1. Go to [keepa.com](https://keepa.com)
2. Create an account or log in
3. Navigate to **API** section
4. Subscribe to a plan (starts at ~$15/month)
5. Copy your API key
6. Paste into the Keepa field and click **Save**

### Keepa Plans

| Plan | Tokens/min | Best For |
|------|-----------|----------|
| Basic | 5 | Light usage, testing |
| Standard | 20 | Regular listing creation |
| Professional | 50+ | High-volume sellers |

## Security

### How Keys Are Stored

- All API keys are **encrypted** before storage
- Encryption uses AES-256
- Keys are only decrypted when making API calls
- Database uses Row Level Security (RLS)

### Best Practices

1. Never share your API keys
2. Regenerate keys if you suspect compromise
3. Use separate keys for testing vs production
4. Review connected apps periodically

## Backend

### Database Columns (users table)

| Column | Type | Description |
|--------|------|-------------|
| `ebay_access_token` | text | Encrypted eBay access token |
| `ebay_refresh_token` | text | Encrypted eBay refresh token |
| `ebay_token_expires_at` | timestamp | Token expiration time |
| `keepa_api_key` | text | Encrypted Keepa API key |

### OAuth Flow

```
1. User clicks "Connect eBay"
      ↓
2. Redirect to eBay authorization URL
      ↓
3. User logs in and approves
      ↓
4. eBay redirects back with auth code
      ↓
5. Exchange code for access + refresh tokens
      ↓
6. Encrypt and store tokens
      ↓
7. User is connected!
```

### Token Refresh

- Access tokens expire after 2 hours
- The system automatically refreshes using the refresh token
- Refresh tokens are long-lived (~18 months)
- If refresh fails, user must reconnect
