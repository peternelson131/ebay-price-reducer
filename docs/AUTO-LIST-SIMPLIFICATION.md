# Technical Design: Auto-List Simplification

## Overview
Simplify the Auto-List feature from a 4-step wizard to a single-action flow: **Enter ASIN → Listing Created**.

Replicate the proven logic from the n8n "Automated eBay Listing Creations" workflow, including Claude AI for title/description generation.

---

## Problem Statement

### Current State
- 4-step wizard (Select Method → Input → Review → Create)
- Multiple clicks and screens before a listing is created
- User must manually review and confirm each step

### Desired State
- Single input field for ASIN
- One click creates the listing
- Shows result immediately (success/failure + listing details)

### Success Criteria
- [ ] User enters ASIN, clicks "Create Listing", listing appears on eBay
- [ ] Title is AI-optimized (Claude) with 80-char limit
- [ ] Description includes condition stipulation + "See description" format
- [ ] Matches n8n workflow output structure
- [ ] < 30 seconds end-to-end

---

## Scope

### In Scope
- Single ASIN → Listing flow
- Claude AI title/description generation
- Keepa product data fetch
- eBay listing creation (inventory → offer → publish)
- Success/error feedback

### Out of Scope (for now)
- Batch ASIN processing (keep existing wizard for that)
- Custom pricing margins
- Draft/review mode
- Google Sheets integration for this flow

---

## Technical Design

### Data Flow
```
[User enters ASIN]
       ↓
[Frontend] POST /api/auto-list-single
       ↓
[Edge Function: auto-list-single]
       ↓
  ┌────┴────┐
  ↓         ↓
[Keepa]  [eBay Category API]
  ↓         ↓
  └────┬────┘
       ↓
[Claude AI] → Generate title + description
       ↓
[eBay Inventory API] → Create inventory item
       ↓
[eBay Offer API] → Create offer
       ↓
[eBay Publish API] → Publish listing
       ↓
[Return: eBay listing URL + details]
```

### API Endpoint

**POST** `/.netlify/functions/auto-list-single`

**Request:**
```json
{
  "asin": "B0123456789"
}
```

**Response (Success):**
```json
{
  "success": true,
  "listing": {
    "ebayListingId": "123456789",
    "ebayUrl": "https://www.ebay.com/itm/123456789",
    "title": "AI-optimized title here",
    "price": 29.99,
    "sku": "PETE-B0123456789",
    "condition": "NEW_OTHER"
  },
  "source": {
    "asin": "B0123456789",
    "amazonTitle": "Original Amazon title",
    "amazonPrice": 34.99
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Keepa API: Product not found",
  "stage": "keepa_fetch"
}
```

### Claude AI Prompt (Title)
```
You are an eBay listing title optimizer. Create a compelling, 
searchable title under 80 characters.

Product: {keepa.title}
Brand: {keepa.brand}
Category: {keepa.category}

Rules:
- Max 80 characters
- Include brand if well-known
- Include key product identifiers (model, size, color)
- No ALL CAPS
- No special characters except hyphens
- No promotional language ("SALE", "FREE SHIPPING")

Output only the title, nothing else.
```

### Claude AI Prompt (Description)
```
Create an eBay listing description for this product.

Product: {keepa.title}
Brand: {keepa.brand}
Features: {keepa.features}
Category: {keepa.category}

Format requirements:
1. Start with product name as heading
2. List 3-5 key features as bullet points
3. Add this exact line: "See description for full details."
4. End with condition notice: "Condition: {condition} - Item is {condition_description}."

Keep it concise, professional, no promotional language.
```

### Description Template (from n8n)
```html
<h2>{ai_title}</h2>

<ul>
  <li>{feature_1}</li>
  <li>{feature_2}</li>
  <li>{feature_3}</li>
</ul>

<p><strong>See description for full details.</strong></p>

<hr>

<p><em>Condition: {condition} - {condition_description}</em></p>
<p>Ships from United States. Thank you for your business!</p>
```

### Pricing Logic (from n8n SuggestedPrice node)
```javascript
function calculatePrice(keepaData) {
  // Get Amazon price (Buy Box or current)
  const amazonPrice = keepaData.stats?.current?.[4] // Buy Box
    || keepaData.stats?.current?.[1] // Amazon price
    || 0;
  
  // Convert from cents
  const priceInDollars = amazonPrice / 100;
  
  // Simple logic: slightly below Amazon (eBay typically sells lower)
  // No margin calculation - just get it listed competitively
  const ebayPrice = Math.max(
    priceInDollars * 0.95,  // 5% below Amazon
    9.99                     // Minimum $9.99
  );
  
  return ebayPrice.toFixed(2);
}
```

---

## Current State Analysis

### What Exists:
✅ `keepa-fetch-product.js` - Fetches Keepa data, transforms to eBay format
✅ Frontend `AutoList.jsx` - Multi-step wizard UI
✅ Frontend calls `create-ebay-listing` endpoint

### What's Missing:
❌ `create-ebay-listing.js` - **THE CORE eBay API FUNCTION DOESN'T EXIST!**
❌ Claude AI integration for title/description
❌ eBay OAuth token refresh logic
❌ Simplified single-step UI

---

## Implementation Tasks

### Task 1: Create eBay Listing Function (M - 4-6 hours) ⚠️ CRITICAL
- [ ] Create `netlify/functions/create-ebay-listing.js`
- [ ] Implement eBay OAuth token refresh
- [ ] Create inventory item (PUT /sell/inventory/v1/inventory_item/{sku})
- [ ] Create offer (POST /sell/inventory/v1/offer)
- [ ] Publish offer (POST /sell/inventory/v1/offer/{offerId}/publish)
- [ ] Store listing in Supabase `listings` table
- [ ] Error handling with rollback

### Task 2: Add Claude AI Integration (S - 2-3 hours)
- [ ] Create `netlify/functions/utils/claude-ai.js`
- [ ] Title generation prompt (80 char limit)
- [ ] Description generation with condition stipulation
- [ ] Integrate into create-ebay-listing flow

### Task 3: Create Single-Step Auto-List Function (S - 2-3 hours)
- [ ] Create `netlify/functions/auto-list-single.js`
- [ ] Orchestrate: Keepa → Claude → eBay flow
- [ ] Single endpoint: ASIN in, listing out

### Task 4: Update Auto-List UI (S - 2-4 hours)
- [ ] Add "Quick Create" section at top of page
- [ ] Single ASIN input field
- [ ] "Create Listing" button
- [ ] Loading state with progress indicator
- [ ] Success state showing listing details + eBay link
- [ ] Error state with clear message

### Task 3: Testing (M - 4-8 hours)
- [ ] Test with 5 different ASINs (various categories)
- [ ] Verify eBay listing appears correctly
- [ ] Verify title is within 80 chars
- [ ] Verify description has required elements
- [ ] Test error cases (invalid ASIN, API failures)
- [ ] Document test results with screenshots

---

## Testing Plan

### Test ASINs
| ASIN | Category | Expected Result |
|------|----------|-----------------|
| B0BSHF7WHB | Electronics | Listing created |
| B0D5RPBK9D | Home | Listing created |
| B09V3KXJPB | Toys | Listing created |
| INVALID123 | N/A | Error: Invalid ASIN |
| B000000000 | N/A | Error: Product not found |

### Verification Checklist
For each successful listing:
- [ ] Title ≤ 80 characters
- [ ] Title is readable/sensible
- [ ] Description has "See description" line
- [ ] Description has condition stipulation
- [ ] Price is reasonable (not $0, not $99999)
- [ ] Images appear on eBay listing
- [ ] SKU follows user's prefix pattern
- [ ] Listing is live and purchasable

### Output Documentation
I will provide:
1. Screenshot of the new UI
2. Console logs showing the API flow
3. Screenshot of created eBay listing
4. Full API response JSON

---

## Rollout Plan

1. **Phase 1:** Implement in development branch
2. **Phase 2:** Test with 3-5 real ASINs (Pete's account)
3. **Phase 3:** Review output together
4. **Phase 4:** Deploy to production if approved

---

## Open Questions

1. **SKU prefix** - Should I use the user's configured prefix (from settings) or a default?

2. **Default condition** - NEW_OTHER (Open Box) or NEW?

3. **Quantity** - Default to 1?

4. **Error retry** - If eBay API fails, should we auto-retry or just report error?

---

## Estimated Timeline

| Task | Estimate | Notes |
|------|----------|-------|
| Edge function | 3 hours | Main logic |
| UI updates | 2 hours | Simple form |
| Testing | 4 hours | Multiple ASINs, verification |
| Documentation | 1 hour | Screenshots, results |
| **Total** | **~10 hours** | Could be done in 1-2 sessions |

---

## Dependencies

- ✅ Keepa API key (already configured)
- ✅ eBay API credentials (already configured)  
- ⚠️ Anthropic/Claude API key (need to verify it's in Netlify env vars)
- ✅ User's eBay seller account connected
