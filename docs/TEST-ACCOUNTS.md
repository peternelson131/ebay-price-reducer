# Test Accounts - eBay Price Reducer

Reference for test accounts and their capabilities for testing different features.

## Accounts

### Pete's Primary Account (Outlook)
- **Email:** peternelson131@outlook.com
- **User ID:** f4d3ec86-8ad2-4a1c-970a-3107f0ccc34c
- **Has Data For:**
  - ✅ eBay Listings (38+ listings)
  - ✅ Catalog Imports (with correlations)
  - ✅ Price Strategies
  - ✅ eBay OAuth Connected
- **Use For Testing:**
  - Catalog Import / Correlations
  - eBay listing sync
  - Price reduction features
  - Full end-to-end workflows

### Clawd Test Account
- **Email:** clawd@test.com
- **User ID:** f6139fe8-f044-40ea-8670-0324e7340230
- **Has Data For:**
  - ❌ No eBay listings
  - ❌ No catalog imports
  - ❌ No eBay connection
- **Use For Testing:**
  - Auth flows (login/signup)
  - Empty state UIs
  - New user onboarding
  - Features that don't require data

### ZoSoph Test Account
- **Email:** test@zosoph.com
- **User ID:** e7e7b22d-2dd2-4fc1-b0c0-f1d38033f79c
- **Has Data For:**
  - ❓ Unknown - needs verification
- **Use For Testing:**
  - TBD

### Pete's Gmail Account
- **Email:** petenelson13@gmail.com
- **User ID:** 94e1f3a0-6e1b-4d23-befc-750fe1832da8
- **Has Data For:**
  - ❓ Unknown - needs verification
- **Use For Testing:**
  - TBD

### Pete's ZoSoph Account
- **Email:** pnelson@zosoph.com
- **User ID:** 54f66142-ab04-43b7-b1b2-7d923c75bed2
- **Has Data For:**
  - ❓ Unknown - needs verification
- **Use For Testing:**
  - TBD

---

## Authentication Method

Use Supabase Admin API to generate magic links for any account:

```bash
SERVICE_KEY="[from .env.local]"

curl -s "https://zxcdkanccbdeqebnabgg.supabase.co/auth/v1/admin/generate_link" \
  -H "Authorization: Bearer $SERVICE_KEY" \
  -H "apikey: $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "magiclink", "email": "EMAIL_HERE"}'
```

The response includes an `action_link` that can be used to authenticate in the browser.

---

## Feature → Account Matrix

| Feature | Recommended Account | Reason |
|---------|---------------------|--------|
| Catalog Import | Pete (Outlook) | Has import data with correlations |
| eBay Listings | Pete (Outlook) | Has connected eBay + listings |
| Price Strategies | Pete (Outlook) | Has active strategies |
| New User Flows | clawd@test.com | Clean account |
| Auth Testing | Any | All accounts work |
| Feedback Form | Any | Works with any logged-in user |
| WhatNot Analysis | Any | External data fetch |
| ASIN Lookup | Any | External API call |

---

## Notes

- **Production URL:** https://dainty-horse-49c336.netlify.app
- **Supabase Project:** zxcdkanccbdeqebnabgg
- **Last Updated:** 2026-01-17
