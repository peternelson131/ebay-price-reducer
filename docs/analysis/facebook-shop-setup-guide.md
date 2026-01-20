# Facebook Shop + Commerce API Setup Guide

## Overview

Products in your Facebook Shop's Commerce Catalog can automatically appear on Facebook Marketplace. This is the **official, API-supported** way to list products programmatically.

---

## Prerequisites

Before you begin, you'll need:

- [ ] Facebook personal account (you have this ✓)
- [ ] Facebook Business Page (for your selling business)
- [ ] Business email address
- [ ] Business information (name, address, tax ID potentially)
- [ ] Bank account or PayPal for payments
- [ ] Product images that meet FB requirements

---

## Step-by-Step Setup

### Phase 1: Create Facebook Business Page (10 min)

1. **Go to:** facebook.com/pages/create
2. **Choose:** "Business or Brand"
3. **Enter:**
   - Page name (e.g., "Pete's Deals" or your business name)
   - Category (e.g., "E-commerce Website" or "Retail Company")
   - Description
4. **Add:**
   - Profile picture (logo or product image)
   - Cover photo
5. **Publish** the page

### Phase 2: Set Up Meta Business Suite (15 min)

1. **Go to:** business.facebook.com
2. **Create a Business Account** (if you don't have one)
3. **Link your Facebook Page** to the Business Account
4. **Verify your business** (may require documents)
   - Business name verification
   - Address verification
   - Sometimes requires EIN or business license

### Phase 3: Access Commerce Manager (10 min)

1. **Go to:** facebook.com/commerce_manager (or find it in Meta Business Suite)
2. **Click:** "Get Started" or "Add Shop"
3. **Choose checkout method:**
   - **Checkout on another website** (easiest - send to your site)
   - **Checkout with Facebook/Instagram** (requires more verification)
   - **Checkout via Messaging** (manual order handling)

### Phase 4: Create Product Catalog (20 min)

1. **In Commerce Manager → Catalog**
2. **Click:** "Add Products"
3. **Choose method:**
   - **Manual** - Add products one by one
   - **Data Feed** - Upload CSV/XML file (bulk)
   - **Partner Platform** - Connect Shopify, BigCommerce, etc.
   - **Pixel** - Auto-import from your website

4. **For each product, provide:**
   - Title
   - Description  
   - Price
   - Images (min 500x500px)
   - Availability
   - Condition (new/used)
   - Brand
   - Category

### Phase 5: Enable Marketplace Distribution (5 min)

1. **In Commerce Manager → Settings**
2. **Look for:** "Sales Channels" or "Distribution"
3. **Enable:** Facebook Marketplace
4. **Note:** This may require approval and can take a few days

### Phase 6: Configure Shipping & Returns (15 min)

1. **In Commerce Manager → Settings → Shipping**
2. **Set up shipping options:**
   - Shipping rates
   - Delivery times
   - Shipping locations

3. **Set up return policy:**
   - Return window (e.g., 30 days)
   - Return conditions

### Phase 7: Submit for Review (Wait 1-5 days)

1. **Review all settings**
2. **Click:** "Submit Shop for Review"
3. **Wait:** Facebook reviews your shop (1-5 business days typically)
4. **Once approved:** Products can appear on Marketplace

---

## Using the Commerce Catalog API

Once your shop is set up, you can use the **Commerce Catalog API** to:

### Add Products Programmatically

```bash
# Example: Add product via API
curl -X POST \
  "https://graph.facebook.com/v18.0/{catalog_id}/products" \
  -H "Authorization: Bearer {access_token}" \
  -d "retailer_id=ASIN123" \
  -d "name=Product Name" \
  -d "description=Product description" \
  -d "availability=in stock" \
  -d "condition=new" \
  -d "price=1999 USD" \
  -d "url=https://yoursite.com/product" \
  -d "image_url=https://yoursite.com/image.jpg"
```

### API Capabilities

| Action | API Support |
|--------|-------------|
| Add products | ✅ Yes |
| Update products | ✅ Yes |
| Delete products | ✅ Yes |
| Bulk upload (feed) | ✅ Yes |
| Inventory sync | ✅ Yes |
| Price updates | ✅ Yes |
| Order management | ✅ Yes |

### Required Permissions

To use the API, your app needs:
- `catalog_management` permission
- `business_management` permission
- Access token with appropriate scopes

---

## Integration with Your App

Once set up, we could add a feature to your eBay Price Reducer:

1. **ASIN → Product Data** (already have via Keepa)
2. **Generate FB Product Feed** (new feature)
3. **Upload to Commerce Catalog** (via API)
4. **Products appear on Marketplace** (automatic)

---

## Important Caveats

### ⚠️ Marketplace Appearance Not Guaranteed

- Products go to your Shop first
- Marketplace distribution depends on:
  - Product category eligibility
  - Your seller history/ratings
  - Facebook's algorithms
  - Demand in your area

### ⚠️ Product Requirements

Facebook has strict requirements:
- No counterfeit items
- Accurate descriptions
- Clear images (no watermarks, text overlays)
- Competitive pricing
- Certain categories restricted (weapons, animals, etc.)

### ⚠️ Checkout Limitations

- As of Sept 2025, Shops use "website checkout" model
- Buyers click through to your site to purchase
- Or handle via Messenger

---

## Timeline Estimate

| Step | Time |
|------|------|
| Create Business Page | 10 min |
| Set up Meta Business Suite | 15 min |
| Business verification | 1-7 days |
| Commerce Manager setup | 30 min |
| Shop review & approval | 1-5 days |
| **Total** | **~1-2 weeks** |

---

## Alternative: Direct Marketplace (Simpler)

If this seems like too much overhead, remember:
- Manual posting takes ~2 min per item
- We can generate optimized listing content for copy-paste
- Zero setup required

---

*Guide created: January 18, 2026*
*Status: Research Complete*
