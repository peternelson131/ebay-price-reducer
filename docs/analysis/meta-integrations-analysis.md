# Meta Integrations Analysis (Instagram, Facebook, Marketplace)

## Executive Summary

**Good news:** Instagram posting and Facebook Page posting can be done with **ONE Meta App**.

**Bad news:** Facebook Marketplace has **NO public API** - listings cannot be created programmatically.

**TikTok** is separate (not Meta) and requires its own integration.

---

## Current Request Breakdown

| Integration | Feasibility | API Available |
|-------------|-------------|---------------|
| Instagram Posting | ✅ Yes | Instagram Content Publishing API |
| Facebook Page Posting | ✅ Yes | Pages API |
| Facebook Marketplace Listing | ❌ No | **No API exists** |
| TikTok | ✅ Yes (separate) | TikTok for Developers |

---

## Facebook Marketplace Reality Check

**There is no Facebook Marketplace API for creating listings programmatically.**

The URL `developers.facebook.com/docs/marketplace-api` returns a 404 page.

### What IS available for Commerce:
- **Catalog Management API** - Manage product catalogs
- **Commerce Account API** - Read/manage orders
- **Shops API** - For Facebook/Instagram Shops (not Marketplace)

### What's NOT available:
- Creating Marketplace listings
- Managing Marketplace inventory
- Automated posting to Marketplace

**Alternative approaches:**
1. **Manual posting** - Users post to Marketplace themselves
2. **Facebook Shops** - If you set up a Facebook Shop, products can be listed there (different from Marketplace)
3. **Third-party tools** - Some use browser automation (risky, against TOS)

---

## Single Meta App Architecture

### ✅ Yes - One App Can Handle Instagram + Facebook Posting

```
┌─────────────────────────────────────────────────────────┐
│                    META APP                              │
│  (One app in Meta Developer Portal)                     │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────┐    ┌─────────────────────┐    │
│  │  INSTAGRAM          │    │  FACEBOOK PAGES     │    │
│  │  Content Publishing │    │  Posts API          │    │
│  │                     │    │                     │    │
│  │  Permissions:       │    │  Permissions:       │    │
│  │  • instagram_basic  │    │  • pages_manage_posts│   │
│  │  • instagram_       │    │  • pages_read_      │    │
│  │    content_publish  │    │    engagement       │    │
│  │  • pages_show_list  │    │  • publish_video    │    │
│  │  • pages_read_      │    │                     │    │
│  │    engagement       │    │                     │    │
│  └─────────────────────┘    └─────────────────────┘    │
│                                                          │
│  Shared:                                                 │
│  • OAuth 2.0 flow                                        │
│  • Facebook Login for Business                           │
│  • Single Business Verification                          │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Required Permissions (All in One App)

| Permission | Purpose | Review Required |
|------------|---------|-----------------|
| `instagram_basic` | Basic Instagram account info | Yes |
| `instagram_content_publish` | Post to Instagram | Yes |
| `pages_show_list` | List connected Pages | Yes |
| `pages_read_engagement` | Read Page data | Yes |
| `pages_manage_posts` | Post to Facebook Pages | Yes |
| `publish_video` | Post videos to Pages | Yes |

### App Review Process
- Each permission requires justification
- Business Verification required for Advanced Access
- Takes 1-5 business days typically
- Need to demonstrate legitimate use case

---

## TikTok Integration (Separate)

TikTok is NOT owned by Meta - requires completely separate integration.

### TikTok for Developers
- **Content Posting API** - Available for approved partners
- **Login Kit** - OAuth for TikTok accounts
- **Share Kit** - Share content to TikTok

### TikTok API Limitations
- Content Posting API is restricted
- Requires partnership approval
- Most apps use Share Kit (opens TikTok app)

---

## Recommended Architecture

### Phase 1: Social Media Posting (One Meta App)
```
Integrations Page
├── 📱 Social Media Integrations
│   ├── YouTube (existing)
│   ├── Instagram (new - via Meta App)
│   └── Facebook Pages (new - via Meta App)
```

### Phase 2: TikTok (Separate Integration)
```
├── 📱 Social Media Integrations
│   ├── YouTube
│   ├── Instagram
│   ├── Facebook Pages
│   └── TikTok (separate OAuth)
```

### Phase 3: Marketplace (Manual/Alternative)
```
├── 🛒 Marketplace Integrations
│   ├── eBay (existing)
│   ├── Keepa (existing)
│   └── Facebook Marketplace (manual workflow or future API)
```

---

## Implementation Approach

### Option A: Start with Instagram + Facebook Pages (Recommended)
**Pros:**
- Single Meta App = single OAuth flow
- Single Business Verification
- Users connect once, post to both platforms
- Well-documented APIs

**Cons:**
- App Review process takes time
- Each permission needs justification

**Effort:** Medium
**Timeline:** 2-3 weeks (including App Review)

### Option B: Add TikTok Later
**Pros:**
- Separate integration, no impact on Meta app
- Can add after Phase 1

**Cons:**
- Separate OAuth flow
- Content Posting API is restricted

**Effort:** Medium
**Timeline:** 2-3 weeks

### Option C: Facebook Marketplace Workaround
**If Pete really wants Marketplace listing:**

1. **Manual Workflow** - App generates listing details, user copies to Marketplace
2. **Facebook Shops** - Different feature, products listed in a Shop (not Marketplace)
3. **Wait for API** - Meta may release Marketplace API in future

---

## Technical Requirements

### Meta Developer App Setup
1. Create app at [developers.facebook.com](https://developers.facebook.com)
2. Add Facebook Login for Business
3. Configure OAuth redirect URIs
4. Request permissions for Instagram + Pages
5. Complete Business Verification
6. Submit for App Review

### Database Schema Additions
```sql
-- Store Meta OAuth tokens
ALTER TABLE user_connections ADD COLUMN IF NOT EXISTS
  meta_access_token TEXT,
  meta_refresh_token TEXT,
  meta_token_expires_at TIMESTAMP,
  meta_page_id TEXT,
  meta_instagram_id TEXT;
```

### Environment Variables
```
META_APP_ID=<from developer portal>
META_APP_SECRET=<from developer portal>
META_REDIRECT_URI=https://dainty-horse-49c336.netlify.app/.netlify/functions/meta-callback
```

---

## Open Questions

1. **Instagram account type:** Does Pete have an Instagram Professional account (required for API)?

2. **Facebook Page:** Does Pete have a Facebook Page to connect? (Required for Instagram API access)

3. **Priority:** Should we start with Instagram, Facebook, or both simultaneously?

4. **TikTok timeline:** When would TikTok be needed?

5. **Marketplace alternatives:** Is the manual workflow acceptable for Facebook Marketplace, or is this a blocker?

---

## Recommendation

**Start with Option A** - Create a single Meta App for Instagram + Facebook Page posting.

1. ✅ Instagram posting - Full API support
2. ✅ Facebook Page posting - Full API support  
3. ❌ Facebook Marketplace - No API (manual workflow only)
4. 🔜 TikTok - Phase 2 (separate integration)

This gives you the most value with one integration while we wait to see if Meta ever releases a Marketplace API.

---
*Analysis created: 2026-01-22*
*Status: Draft - Awaiting Review*
