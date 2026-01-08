# eBay Price Reducer - SaaS Requirements Checklist

## ✅ Completed Tonight

### Database Infrastructure
- [x] `user_api_keys` table created in Supabase
- [x] `api_usage` table for tracking usage
- [x] Row Level Security (RLS) policies enabled
- [x] Users can only see their own keys

### Frontend
- [x] `/api-keys` page for managing credentials
- [x] Support for Keepa API key
- [x] Support for eBay credentials (App ID, Cert ID, Dev ID, Refresh Token)
- [x] Navigation link added

### Backend
- [x] v2 function fetches user's Keepa key from DB
- [x] Falls back to admin key if user hasn't added one
- [x] Usage tracking function ready

---

## 🔄 In Progress / Needs Work

### Serverless v2 Function
- [ ] **Debug the 500 error on sync** (Keepa or Claude API call failing)
- [ ] Add better error handling and logging
- [ ] Test end-to-end with user's own Keepa key

### eBay Integration
- [ ] Create function to use user's eBay credentials for listings
- [ ] OAuth token refresh handling
- [ ] Test listing creation with user credentials

---

## 📋 Required User Credentials

| Service | Credential | Where to Get |
|---------|------------|--------------|
| **Keepa** | API Key | https://keepa.com/#!api |
| **eBay** | App ID (Client ID) | https://developer.ebay.com/my/keys |
| **eBay** | Cert ID (Client Secret) | https://developer.ebay.com/my/keys |
| **eBay** | Dev ID | https://developer.ebay.com/my/keys |
| **eBay** | Refresh Token | OAuth flow (need to build) |

---

## 🔐 Admin Credentials (Your Netlify Env Vars)

These are YOUR keys that the app uses as fallback or for shared features:

| Env Var | Purpose | Status |
|---------|---------|--------|
| `SUPABASE_URL` | Database connection | ✅ Set |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin DB access | ✅ Set |
| `ANTHROPIC_API_KEY` | AI evaluation (you pay) | ✅ Set |
| `KEEPA_API_KEY` | Fallback for users | ✅ Set |
| `N8N_ASIN_CORRELATION_WEBHOOK_URL` | Legacy n8n | ✅ Set |

---

## 🏗️ Architecture for Multi-Tenant

```
User Request
     │
     ▼
┌─────────────────┐
│ Netlify Function │
│ (authenticate)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Get User's Keys │◄── user_api_keys table
│ from Supabase   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│ Keepa  │ │ Claude │ ◄── Your Anthropic key (shared)
│ (user) │ │ (you)  │
└────────┘ └────────┘
         │
         ▼
┌─────────────────┐
│ Track Usage     │──► api_usage table
│ (optional bill) │
└─────────────────┘
```

---

## 💰 Cost Model

### Costs You Bear (Per User Lookup)
- **Claude AI**: ~$0.005 per ASIN lookup
- **Supabase**: ~$0.001 per lookup (negligible)
- **Netlify**: Free tier covers most usage

### Costs User Bears
- **Keepa API**: User's own subscription (~$15-50/month)
- **eBay API**: Free (developer account)

### Suggested Pricing
| Tier | Price | Includes |
|------|-------|----------|
| Free | $0 | 10 lookups/month |
| Pro | $29/mo | 500 lookups/month |
| Business | $79/mo | 2000 lookups/month |

Your cost at Business tier: ~$10/user/month → 87% margin

---

## 🚀 Next Steps (Priority Order)

1. **Fix v2 serverless sync** - Debug the 500 error
2. **Test API Keys page** - Have a user add their Keepa key
3. **Build eBay OAuth flow** - For user's eBay refresh token
4. **Add usage tracking** - Show users their API usage
5. **Build billing (Stripe)** - Accept payments

---

## 📁 Files Modified/Created

```
frontend/src/
├── App.jsx                    # Added ApiKeys route + nav
├── pages/
│   └── ApiKeys.jsx            # NEW: API key management page

netlify/functions/
├── trigger-asin-correlation-v2.js  # Updated: user key lookup

Supabase Tables:
├── user_api_keys              # NEW: stores encrypted keys
└── api_usage                  # NEW: tracks usage
```

---

## 🔧 Testing the API Keys Page

1. Deploy completes (~2 min)
2. Go to: https://dainty-horse-49c336.netlify.app/api-keys
3. Add your Keepa API key
4. Try Influencer Central with v2 endpoint
5. Verify it uses your stored key

---

Last updated: 2026-01-08 05:15 CST
