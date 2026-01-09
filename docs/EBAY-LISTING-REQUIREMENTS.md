# eBay Listing Creation - Requirements & User Stories

## Problem Statement

**Goal:** Allow users to create eBay listings directly from Amazon ASIN data via Keepa, eliminating manual data entry.

**Current State:** 
- n8n workflow exists but is fragile and hard to maintain
- Manual process: Find product → Copy data → Create listing → Set price
- No direct ASIN → eBay listing flow in the app

**Success Criteria:**
- [ ] User enters ASIN, listing appears on eBay within 60 seconds
- [ ] Correct eBay category selected automatically
- [ ] Titles/descriptions match n8n output quality
- [ ] SKU prefix "wi_" applied automatically
- [ ] Condition set appropriately per category

---

## eBay API Overview

### Two-Step Listing Process

eBay's Inventory API uses a 2-step process:

1. **Inventory Item** - The product catalog entry (SKU, title, description, images, aspects)
2. **Offer** - The actual listing (price, quantity, category, fulfillment policy, listing format)

```
[Create Inventory Item] → [Create Offer] → [Publish Offer] = Live Listing
```

### Key API Endpoints

| Step | Endpoint | Purpose |
|------|----------|---------|
| 1 | `PUT /sell/inventory/v1/inventory_item/{sku}` | Create/update inventory item |
| 2 | `POST /sell/inventory/v1/offer` | Create offer for inventory item |
| 3 | `POST /sell/inventory/v1/offer/{offerId}/publish` | Publish offer (make live) |
| Cleanup | `DELETE /sell/inventory/v1/offer/{offerId}` | Delete offer |
| Cleanup | `DELETE /sell/inventory/v1/inventory_item/{sku}` | Delete inventory item |

### Category-Specific Requirements

Different eBay categories require different **Item Specifics** (aspects):
- **Video Games:** Platform, Rating, Game Name, Release Year
- **Toys:** Brand, Age Level, Character Family
- **Electronics:** Brand, Model, MPN, UPC

We need a mapping system: `Amazon Category → eBay Category ID → Required Aspects`

---

## User Stories (Priority Order)

### Epic: ASIN → eBay Listing Pipeline

---

### Story 1: Create eBay Inventory Item ✅ Foundation
**As a** seller  
**I want to** create an eBay inventory item from ASIN data  
**So that** I have a product entry ready for listing

**Acceptance Criteria:**
- [ ] Function accepts ASIN and user ID
- [ ] Fetches product data from Keepa
- [ ] Creates inventory item via eBay API
- [ ] Returns SKU and inventory item details
- [ ] Handles API errors gracefully

**Tasks:**
- [ ] 1.1: Create `create-ebay-inventory-item.js` function
- [ ] 1.2: Map Keepa data to eBay inventory item schema
- [ ] 1.3: Generate SKU with "wi_" prefix + ASIN
- [ ] 1.4: Handle image URLs (eBay requires HTTPS)
- [ ] 1.5: Test with real ASIN, verify item created
- [ ] 1.6: Clean up test data (delete inventory item)

**Test ASINs:**
- B01KJEOCDW (LEGO Dinosaur)
- B0DGPMKPV6 (Pete's test product)

---

### Story 2: Create eBay Offer
**As a** seller  
**I want to** create an offer for my inventory item  
**So that** I can set price, quantity, and category

**Acceptance Criteria:**
- [ ] Function accepts SKU, price, quantity, category ID
- [ ] Creates offer linked to inventory item
- [ ] Sets fulfillment policy (shipping)
- [ ] Sets payment policy
- [ ] Sets return policy
- [ ] Returns offer ID

**Tasks:**
- [ ] 2.1: Create `create-ebay-offer.js` function
- [ ] 2.2: Look up user's eBay business policies (or use defaults)
- [ ] 2.3: Map category ID correctly
- [ ] 2.4: Set listing format (Fixed Price)
- [ ] 2.5: Test offer creation
- [ ] 2.6: Clean up test data

**Dependencies:** Story 1 complete

---

### Story 3: Publish eBay Offer
**As a** seller  
**I want to** publish my offer to make it live  
**So that** buyers can see and purchase my item

**Acceptance Criteria:**
- [ ] Function accepts offer ID
- [ ] Publishes offer to eBay marketplace
- [ ] Returns listing ID and URL
- [ ] Handles publish errors (missing data, policy violations)

**Tasks:**
- [ ] 3.1: Create `publish-ebay-offer.js` function
- [ ] 3.2: Handle publish validation errors
- [ ] 3.3: Store listing ID in database
- [ ] 3.4: Test end-to-end: inventory → offer → publish
- [ ] 3.5: Delete test listing after verification

**Dependencies:** Stories 1 & 2 complete

---

### Story 4: Category Mapping System
**As a** seller  
**I want** automatic eBay category selection  
**So that** I don't have to manually look up categories

**Acceptance Criteria:**
- [ ] Database table maps Amazon categories → eBay categories
- [ ] Includes required item specifics per category
- [ ] Fallback to generic category if no match
- [ ] Admin can add/edit mappings

**Tasks:**
- [ ] 4.1: Create `ebay_category_mappings` table
- [ ] 4.2: Seed with common categories (Video Games, Toys, Electronics)
- [ ] 4.3: Create lookup function
- [ ] 4.4: Integrate into inventory item creation
- [ ] 4.5: Handle unmapped categories gracefully

**Schema:**
```sql
CREATE TABLE ebay_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amazon_category TEXT NOT NULL,
  ebay_category_id TEXT NOT NULL,
  ebay_category_name TEXT,
  required_aspects JSONB, -- {"Platform": true, "Brand": true}
  default_condition TEXT, -- "New", "Like New", etc.
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### Story 5: AI Title/Description Generation
**As a** seller  
**I want** AI-generated titles and descriptions  
**So that** my listings are optimized and consistent

**Acceptance Criteria:**
- [ ] Uses Claude Haiku for speed/cost
- [ ] Generates eBay-compliant title (80 char max)
- [ ] Generates description with condition stipulation
- [ ] Includes "See description" line
- [ ] Output matches n8n workflow quality

**Tasks:**
- [ ] 5.1: Create Claude integration utility
- [ ] 5.2: Design prompts matching n8n workflow
- [ ] 5.3: Add title generation function
- [ ] 5.4: Add description generation function
- [ ] 5.5: Handle rate limits and errors
- [ ] 5.6: Test output quality

**Prompt Template (from n8n):**
```
Generate an eBay listing title for this product:
- Keep under 80 characters
- Include brand and key features
- No promotional language
- Product: {title}
- Brand: {brand}
- Category: {category}
```

---

### Story 6: Single-Step Auto-List Endpoint
**As a** seller  
**I want to** enter an ASIN and get a live listing  
**So that** listing creation is fast and simple

**Acceptance Criteria:**
- [ ] Single endpoint: POST /auto-list with ASIN
- [ ] Orchestrates all steps: Keepa → Inventory → Offer → Publish
- [ ] Returns listing URL on success
- [ ] Provides detailed error on failure
- [ ] Stores listing in database with ASIN correlation

**Tasks:**
- [ ] 6.1: Create `auto-list-single.js` orchestration function
- [ ] 6.2: Chain all previous functions
- [ ] 6.3: Add transaction-like rollback on failure
- [ ] 6.4: Store listing record in database
- [ ] 6.5: Return comprehensive response
- [ ] 6.6: End-to-end test with real ASIN

**Dependencies:** Stories 1-5 complete

---

### Story 7: Simplified Auto-List UI
**As a** seller  
**I want** a simple UI to enter ASIN and create listing  
**So that** I can list items quickly

**Acceptance Criteria:**
- [ ] Single input field for ASIN
- [ ] "Create Listing" button
- [ ] Progress indicator during creation
- [ ] Success: Show listing URL
- [ ] Error: Show what went wrong

**Tasks:**
- [ ] 7.1: Simplify AutoList.jsx page
- [ ] 7.2: Remove multi-step wizard
- [ ] 7.3: Add progress states
- [ ] 7.4: Show result with link to eBay listing
- [ ] 7.5: Add error handling UI

**Dependencies:** Story 6 complete

---

## Out of Scope (Phase 2)

- [ ] Bulk listing from CSV
- [ ] Automatic repricing
- [ ] Inventory sync with eBay
- [ ] Multiple marketplace support (eBay UK, DE, etc.)
- [ ] Variation listings (multiple sizes/colors)

---

## Testing Strategy

### For Each Story:
1. **Unit test** the function with mock data
2. **Integration test** with real eBay API (sandbox or prod)
3. **Clean up** any test data created in prod
4. **Document** any issues found

### Test Cleanup Pattern:
```javascript
// After creating test listing
const { listingId, offerId, sku } = await createTestListing();

// Verify it works
expect(listingId).toBeDefined();

// Clean up
await ebayApi.deleteOffer(offerId);
await ebayApi.deleteInventoryItem(sku);
```

---

## Progress Tracking

| Story | Status | Notes |
|-------|--------|-------|
| 1. Inventory Item | 🔲 Not Started | |
| 2. Create Offer | 🔲 Not Started | |
| 3. Publish Offer | 🔲 Not Started | |
| 4. Category Mapping | 🔲 Not Started | |
| 5. AI Generation | 🔲 Not Started | |
| 6. Auto-List Endpoint | 🔲 Not Started | |
| 7. Simplified UI | 🔲 Not Started | |

---

## Reference: n8n Workflow Nodes

From the existing n8n "Automated eBay Listing Creations" workflow:
1. Schedule Trigger → Manual/Cron
2. Keepa API → Fetch product data
3. eBay Category Fields → Map category + aspects
4. Claude Review → Generate title/description
5. SuggestedPrice → Calculate listing price
6. CreateInventoryItem → eBay Inventory API
7. CreateOfferAPI → eBay Offer API
8. PublishOfferAPI → Make live

This document mirrors that flow in serverless functions.
