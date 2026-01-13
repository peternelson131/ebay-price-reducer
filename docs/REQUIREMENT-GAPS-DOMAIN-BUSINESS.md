# eBay Price Reducer - Domain & Business Requirements Gap Analysis

> **Purpose:** Identify gaps between current implementation and required functionality  
> **Date:** January 2026  
> **Analyst:** Business Analyst Agent

---

## Executive Summary

This analysis identifies **27 gaps** across Domain and Business requirements for the eBay Price Reducer SaaS application. The gaps are prioritized based on impact to core functionality and revenue generation.

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Domain (eBay/Marketplace) | 3 | 5 | 4 | 2 | 14 |
| Domain (Amazon/Keepa) | 1 | 2 | 2 | 1 | 6 |
| Business (Revenue/Growth) | 2 | 3 | 1 | 1 | 7 |
| **Total** | **6** | **10** | **7** | **4** | **27** |

---

## Part 1: Domain Requirements Gaps

### 1.1 eBay API Constraints

#### GAP-D001: Rate Limit Monitoring & Enforcement
**Priority:** 🔴 High  
**Current State:** Architecture mentions rate limiting but no visible implementation  
**Gap:** No user-facing rate limit tracking or proactive throttling

**Requirements:**
- [ ] Display API call usage per user (X of 2M calls/day)
- [ ] Alert when approaching 80% of daily limit
- [ ] Graceful degradation when limits hit
- [ ] Per-endpoint tracking (Inventory vs Analytics APIs have different limits)

**Risk:** Users could hit rate limits during critical operations (bulk price updates), causing partial updates and data inconsistency.

**Recommendation:**
```
Priority: Implement before scaling to 50+ users
Effort: 2-3 days
```

---

#### GAP-D002: eBay Sandbox vs Production Environment Toggle
**Priority:** 🟡 Medium  
**Current State:** Architecture shows `EBAY_ENVIRONMENT=production` but no user switching  
**Gap:** No way for users to test in sandbox before going live

**Requirements:**
- [ ] Environment selector in Admin Settings
- [ ] Clear visual indicator of current environment
- [ ] Separate OAuth credentials per environment
- [ ] Warning when switching environments

**Risk:** Users may inadvertently test features on live listings.

**Recommendation:**
```
Priority: Implement for developer/power user tier
Effort: 1-2 days
```

---

#### GAP-D003: eBay Condition Code Mapping
**Priority:** 🔴 Critical  
**Current State:** Auto-list has static condition multipliers, no eBay condition code validation  
**Gap:** Amazon condition codes don't map 1:1 to eBay codes

**eBay Condition Requirements by Category:**
| Category | Allowed Conditions | Code Range |
|----------|-------------------|------------|
| Video Games | New, Like New, Very Good, Good, Acceptable | 1000-5000 |
| Electronics | New, Refurbished, Used | 1000-3000 |
| Collectibles | New, Like New, Used | 1000-3000 |
| Books | New, Like New, Very Good, Good, Acceptable | 1000-5000 |

**Requirements:**
- [ ] Map Amazon FBA conditions to eBay condition codes
- [ ] Category-specific condition validation
- [ ] Reject invalid condition/category combinations
- [ ] Default condition per category if not specified

**Risk:** Listings rejected by eBay API or policy violations.

**Recommendation:**
```
Priority: Must fix before Auto-List feature is reliable
Effort: 2 days (database + lookup logic)
```

---

#### GAP-D004: Item Specifics (Aspects) Completion
**Priority:** 🔴 Critical  
**Current State:** Taxonomy API bulk endpoint used, 7,111 categories stored  
**Gap:** No automated population of required aspects in listings

**Requirements:**
- [ ] Query stored aspects when creating listing
- [ ] Map Keepa product data → eBay aspects
- [ ] Handle "not applicable" for optional aspects
- [ ] Show missing required aspects before publish
- [ ] Category-specific aspect inference from title/description

**Impact Table:**
| Missing Aspects | Result |
|-----------------|--------|
| 1-2 Required | Listing may fail to publish |
| Optional only | Lower search visibility |
| Brand/MPN | Miss buyer searches |

**Recommendation:**
```
Priority: Critical for listing creation to work reliably
Effort: 3-5 days (mapping + AI inference for gaps)
```

---

#### GAP-D005: Business Policies Auto-Discovery
**Priority:** 🔴 High  
**Current State:** Lessons show `fulfillmentPolicyId`, `paymentPolicyId`, `returnPolicyId` required  
**Gap:** No automatic fetching of user's existing eBay policies

**Requirements:**
- [ ] Fetch user's policies on OAuth connect
- [ ] Store policy IDs in `user_settings` table
- [ ] Allow user to select default policies
- [ ] Handle users with no policies (create defaults?)
- [ ] Refresh policies periodically

**Risk:** Offer creation fails with confusing errors if policies not configured.

**Recommendation:**
```
Priority: Required for streamlined onboarding
Effort: 1-2 days
```

---

#### GAP-D006: Merchant Location Management
**Priority:** 🔴 High  
**Current State:** Lessons note "Publish failed with No Item.Country exists"  
**Gap:** No location management in the app

**Requirements:**
- [ ] Fetch user's merchant locations on OAuth
- [ ] Store default `merchantLocationKey`
- [ ] Allow creating new locations
- [ ] Handle users with no location (require setup)

**Risk:** Cannot publish offers without location.

**Recommendation:**
```
Priority: Required for listing creation
Effort: 1 day
```

---

#### GAP-D007: Listing Compliance Validation
**Priority:** 🟡 Medium  
**Current State:** No pre-submission validation  
**Gap:** Users don't know if listing will fail until they try to publish

**Requirements:**
- [ ] Pre-validate listing before API call
- [ ] Check: title length (80 char), description required, price > 0
- [ ] Category-specific validation (aspects, conditions)
- [ ] Show validation errors in UI before submit
- [ ] eBay compliance rules (prohibited items, restricted categories)

**Recommendation:**
```
Priority: Improves UX, reduces API errors
Effort: 2-3 days
```

---

### 1.2 Seller Requirements

#### GAP-D008: Multi-Marketplace Support
**Priority:** 🟢 Low (Future)  
**Current State:** Single marketplace (US) assumed  
**Gap:** No support for eBay UK, DE, AU, etc.

**Requirements:**
- [ ] Marketplace selector in account settings
- [ ] Currency handling per marketplace
- [ ] Localized category trees
- [ ] Marketplace-specific policies

**Recommendation:**
```
Priority: Post-MVP, competitive differentiator
Effort: 2-3 weeks
```

---

#### GAP-D009: Seller Performance Monitoring
**Priority:** 🟡 Medium  
**Current State:** No seller metrics integration  
**Gap:** Users can't see how their seller standing affects features

**Requirements:**
- [ ] Fetch seller level (Top Rated, Above Standard, Below Standard)
- [ ] Show seller dashboard metrics
- [ ] Alert on performance issues that could restrict features
- [ ] Track defect rate approaching thresholds

**Risk:** Below Standard sellers have API restrictions users won't understand.

**Recommendation:**
```
Priority: Important for power users
Effort: 1-2 days
```

---

### 1.3 Category-Specific Rules

#### GAP-D010: Category Restrictions Awareness
**Priority:** 🟡 Medium  
**Current State:** No handling of restricted/gated categories  
**Gap:** Users may try to list in categories they're not approved for

**Restricted Categories (examples):**
- Coins & Currency (requires authorization)
- Wine (age verification, state restrictions)
- Motor Vehicles (special requirements)
- Gift Cards (prohibited in some cases)

**Requirements:**
- [ ] Detect restricted category before listing creation
- [ ] Show warning with authorization requirements
- [ ] Alternative category suggestions
- [ ] Block listing attempt if category definitely blocked

**Recommendation:**
```
Priority: Prevents frustrating failures
Effort: 2 days
```

---

### 1.4 Amazon → eBay Data Mapping

#### GAP-D011: ASIN to UPC/EAN Translation
**Priority:** 🔴 Critical  
**Current State:** Keepa provides product codes, not always used  
**Gap:** eBay prefers UPC/EAN for product identification

**Requirements:**
- [ ] Extract UPC/EAN from Keepa response
- [ ] Handle missing product codes gracefully
- [ ] eBay catalog matching when UPC available
- [ ] Fall back to manual item if no match

**Benefits:**
- Better search visibility
- Catalog-based listings (faster creation)
- More buyer trust

**Recommendation:**
```
Priority: Improves listing quality significantly
Effort: 1-2 days
```

---

#### GAP-D012: Amazon Image URL Handling
**Priority:** 🔴 High  
**Current State:** Images fetched from Keepa/Amazon  
**Gap:** Amazon image URLs may be blocked by eBay

**Requirements:**
- [ ] Validate image URL accessibility
- [ ] Re-host images to prevent blocking (Supabase storage?)
- [ ] Handle HTTPS requirement
- [ ] Multiple image support (eBay allows 12)
- [ ] Image dimension validation (min 500x500 for gallery)

**Risk:** Listings fail or appear without images.

**Recommendation:**
```
Priority: Required for reliable listing creation
Effort: 2-3 days (including storage setup)
```

---

#### GAP-D013: Title/Description Compliance
**Priority:** 🔴 High  
**Current State:** AI generates titles/descriptions  
**Gap:** No validation against eBay's title policies

**eBay Title Rules:**
- Max 80 characters
- No ALL CAPS
- No excessive punctuation
- No keyword stuffing
- No contact information
- No promotional phrases (FREE, L@@K, etc.)

**Requirements:**
- [ ] Post-process AI output for compliance
- [ ] Strip prohibited phrases
- [ ] Character limit enforcement
- [ ] Preview before creation
- [ ] User can edit before submit

**Recommendation:**
```
Priority: Required for listings to publish
Effort: 1-2 days
```

---

### 1.5 Pricing Rules & Restrictions

#### GAP-D014: eBay Pricing Constraints
**Priority:** 🟡 Medium  
**Current State:** Price reduction allows any percentage  
**Gap:** No validation of eBay's pricing rules

**eBay Pricing Rules:**
- Minimum price: $0.99 (most categories)
- Maximum price: $50,000 (some categories higher)
- Price must include item + shipping for "free shipping" listings
- Cannot increase price after buyer commits

**Requirements:**
- [ ] Enforce minimum price per category
- [ ] Warn on suspicious prices (too low/high)
- [ ] Handle "free shipping" pricing correctly
- [ ] Prevent reductions below profitability threshold

**Recommendation:**
```
Priority: Prevents policy violations
Effort: 1 day
```

---

## Part 2: Amazon/Keepa Domain Gaps

#### GAP-D015: Keepa Token Budget Management
**Priority:** 🔴 Critical  
**Current State:** Usage tracked in `api_usage` table  
**Gap:** No user-facing budget controls or warnings

**Token Economics:**
| Plan | Tokens/Month | Cost | Per ASIN |
|------|--------------|------|----------|
| 20/min | 892,800 | €49 | 1 token |
| 60/min | 2,678,400 | €129 | 1 token |

**Requirements:**
- [ ] Show remaining tokens in UI
- [ ] Token usage per operation breakdown
- [ ] Alert at 80% usage
- [ ] Block operations when depleted (or fallback to admin key?)
- [ ] Usage history/analytics

**Risk:** Users exhaust tokens unexpectedly, lose functionality mid-month.

**Recommendation:**
```
Priority: Critical for user experience
Effort: 2 days
```

---

#### GAP-D016: Keepa Data Staleness Handling
**Priority:** 🟡 Medium  
**Current State:** Direct API calls on demand  
**Gap:** No caching strategy for Keepa data

**Data Freshness by Type:**
| Data | Freshness | Recommended Cache |
|------|-----------|-------------------|
| Price history | 1 hour | 30 min |
| Sales rank | 1 hour | 30 min |
| Offer count | 1 hour | 15 min |
| Product details | Days | 24 hours |

**Requirements:**
- [ ] Cache Keepa responses in Supabase
- [ ] Serve cached data for repeat lookups
- [ ] Show data age to user
- [ ] Force refresh option

**Recommendation:**
```
Priority: Reduces costs, improves speed
Effort: 2-3 days
```

---

#### GAP-D017: Product Finder Integration
**Priority:** 🟡 Medium  
**Current State:** Only single-ASIN lookups  
**Gap:** No bulk product discovery feature

**Keepa Product Finder capabilities:**
- Find products matching criteria (price, rank, competition)
- 10,000 ASINs per query
- 20 tokens per query

**Use Case:** "Find me all products in Video Games with <10 sellers and BSR <50,000"

**Requirements:**
- [ ] Product Finder UI in app
- [ ] Filter builder (category, rank, offer count, price)
- [ ] Results displayed in table
- [ ] Import selected products to listings

**Recommendation:**
```
Priority: Competitive advantage, power user feature
Effort: 3-5 days
```

---

#### GAP-D018: Competition Trend Analysis
**Priority:** 🟢 Low  
**Current State:** Basic offer count available  
**Gap:** No historical competition analysis

**Available from Keepa:**
- Offer count over time (csv[11])
- Buy Box history with seller IDs
- Seller rating trends

**Requirements:**
- [ ] Chart showing seller count over time
- [ ] Identify when competitors entered/exited
- [ ] Alert on sudden competition increase
- [ ] "Competition Score" summary metric

**Recommendation:**
```
Priority: Nice-to-have analytics feature
Effort: 2-3 days
```

---

## Part 3: Business Requirements Gaps

### 3.1 SaaS Monetization

#### GAP-B001: Stripe Payment Integration
**Priority:** 🔴 Critical  
**Current State:** Billing UI exists but no actual payment processing  
**Gap:** Cannot charge customers

**Proposed Tiers (from SAAS-REQUIREMENTS.md):**
| Tier | Price | Lookups | Listings |
|------|-------|---------|----------|
| Free | $0 | 10/mo | 25 |
| Pro | $29/mo | 500/mo | 500 |
| Business | $79/mo | 2000/mo | Unlimited |

**Requirements:**
- [ ] Stripe checkout integration
- [ ] Subscription management (upgrade/downgrade)
- [ ] Usage-based billing option?
- [ ] Invoice generation
- [ ] Failed payment handling
- [ ] Trial period support (14 days?)
- [ ] Proration on plan changes

**Revenue Impact:** Cannot monetize without this.

**Recommendation:**
```
Priority: MVP blocker for revenue
Effort: 3-5 days
```

---

#### GAP-B002: Usage Limits Enforcement
**Priority:** 🔴 Critical  
**Current State:** `api_usage` table exists, no enforcement  
**Gap:** Free users can use unlimited resources

**Requirements:**
- [ ] Track lookups against tier limits
- [ ] Block operations when limit hit
- [ ] Show usage meter in dashboard
- [ ] Upgrade prompt when approaching limit
- [ ] Daily/monthly limit reset logic
- [ ] Grace period handling

**Risk:** Operating at a loss if free users abuse resources.

**Recommendation:**
```
Priority: Required before public launch
Effort: 2-3 days
```

---

### 3.2 Competitive Advantage

#### GAP-B003: AI-Powered Pricing Recommendations
**Priority:** 🟡 High  
**Current State:** Static percentage reductions  
**Gap:** No intelligent pricing based on market data

**Feature Vision:**
- Analyze competitor prices
- Factor in sales velocity
- Recommend optimal price for goal (speed vs. margin)
- Learn from user's sales history

**Requirements:**
- [ ] Aggregate market data (Browse API + Keepa)
- [ ] ML model for price optimization (or rule-based MVP)
- [ ] "Suggested Price" column in listings
- [ ] One-click apply recommendation
- [ ] A/B testing of pricing strategies

**Competitive Edge:** Most tools do static reductions. Smart pricing = differentiation.

**Recommendation:**
```
Priority: Major differentiator, do after core MVP
Effort: 2-3 weeks
```

---

#### GAP-B004: Crosslisting Automation (Amazon → eBay)
**Priority:** 🔴 High  
**Current State:** Auto-list exists but requires manual ASIN entry  
**Gap:** No automatic discovery of crosslist-worthy items

**Feature Vision:**
- Scan user's Amazon inventory (via SP-API if connected)
- Identify items worth crosslisting (margin, competition)
- One-click crosslist with optimized details

**Requirements:**
- [ ] Amazon SP-API integration (separate OAuth)
- [ ] Inventory sync from Amazon
- [ ] Margin calculator with fee comparison
- [ ] Recommended items list
- [ ] Batch crosslist capability

**Risk:** Complex integration, but high value for arbitrage sellers.

**Recommendation:**
```
Priority: Post-MVP premium feature
Effort: 2-3 weeks
```

---

### 3.3 User Acquisition & Retention

#### GAP-B005: Onboarding Completion Tracking
**Priority:** 🟡 High  
**Current State:** Business requirements mention onboarding checklist  
**Gap:** No analytics on where users drop off

**Requirements:**
- [ ] Track each onboarding step completion
- [ ] Funnel analytics (signup → OAuth → import → first reduction)
- [ ] Identify friction points
- [ ] Automated follow-up for incomplete onboarding
- [ ] Time-to-value metric

**Retention Impact:** Users who don't complete onboarding churn quickly.

**Recommendation:**
```
Priority: Important for growth
Effort: 2 days
```

---

#### GAP-B006: User Engagement Metrics
**Priority:** 🟡 Medium  
**Current State:** No user analytics  
**Gap:** Can't measure feature adoption or engagement

**Metrics to Track:**
- DAU/MAU
- Feature usage (which features are used)
- Session duration
- Listings managed per user
- Price reductions executed
- Conversion rate (free → paid)

**Requirements:**
- [ ] Analytics integration (Mixpanel, Amplitude, or PostHog)
- [ ] Event tracking throughout app
- [ ] User cohort analysis
- [ ] Feature adoption dashboards

**Recommendation:**
```
Priority: Required for data-driven decisions
Effort: 2-3 days (integration + event planning)
```

---

### 3.4 Cost Structure

#### GAP-B007: Claude API Cost Controls
**Priority:** 🟡 Medium  
**Current State:** Claude calls happen per ASIN lookup  
**Gap:** No cost monitoring or controls

**Current Cost Model:**
- ~$0.005 per lookup (Claude Haiku for title/description)
- 87% margin at $79/mo Business tier (per SAAS-REQUIREMENTS)

**Requirements:**
- [ ] Track Claude API costs per user
- [ ] Cost alerts for admin
- [ ] Cache common operations (same ASIN = same title)
- [ ] Batch AI calls where possible
- [ ] Consider cheaper models for simple tasks

**Risk:** Costs could exceed revenue if usage spikes.

**Recommendation:**
```
Priority: Monitor before scaling
Effort: 1-2 days
```

---

## Priority Summary & Roadmap

### 🔴 Critical (Block MVP/Revenue)

| Gap | Description | Effort |
|-----|-------------|--------|
| GAP-D003 | Condition code mapping | 2 days |
| GAP-D004 | Item specifics completion | 3-5 days |
| GAP-D012 | Image URL handling | 2-3 days |
| GAP-D015 | Keepa token management | 2 days |
| GAP-B001 | Stripe integration | 3-5 days |
| GAP-B002 | Usage limits enforcement | 2-3 days |

**Total Critical Effort:** ~14-20 days

---

### 🟡 High (Block Scalability)

| Gap | Description | Effort |
|-----|-------------|--------|
| GAP-D001 | Rate limit monitoring | 2-3 days |
| GAP-D005 | Business policies auto-discovery | 1-2 days |
| GAP-D006 | Merchant location management | 1 day |
| GAP-D011 | ASIN to UPC translation | 1-2 days |
| GAP-D013 | Title/description compliance | 1-2 days |
| GAP-B003 | AI pricing recommendations | 2-3 weeks |
| GAP-B004 | Crosslisting automation | 2-3 weeks |
| GAP-B005 | Onboarding tracking | 2 days |

**Total High Effort:** ~5-8 weeks

---

### 🟢 Medium/Low (Competitive Advantage)

| Gap | Description | Effort |
|-----|-------------|--------|
| GAP-D002 | Sandbox/production toggle | 1-2 days |
| GAP-D007 | Listing compliance validation | 2-3 days |
| GAP-D008 | Multi-marketplace support | 2-3 weeks |
| GAP-D009 | Seller performance monitoring | 1-2 days |
| GAP-D010 | Category restrictions | 2 days |
| GAP-D014 | Pricing constraints | 1 day |
| GAP-D016 | Keepa data caching | 2-3 days |
| GAP-D017 | Product Finder integration | 3-5 days |
| GAP-D018 | Competition trend analysis | 2-3 days |
| GAP-B006 | User engagement metrics | 2-3 days |
| GAP-B007 | Claude cost controls | 1-2 days |

---

## Recommended Implementation Phases

### Phase 1: MVP Completion (Weeks 1-3)
Focus on critical gaps that block core functionality:
1. GAP-B001: Stripe integration
2. GAP-B002: Usage limits
3. GAP-D003: Condition codes
4. GAP-D004: Item specifics
5. GAP-D012: Image handling
6. GAP-D015: Keepa tokens

### Phase 2: Reliability (Weeks 4-5)
Fix gaps that cause user frustration:
1. GAP-D005: Business policies
2. GAP-D006: Merchant locations
3. GAP-D013: Title compliance
4. GAP-D001: Rate limits
5. GAP-B005: Onboarding tracking

### Phase 3: Growth Features (Weeks 6-10)
Build competitive differentiation:
1. GAP-B003: AI pricing
2. GAP-D017: Product Finder
3. GAP-D016: Keepa caching
4. GAP-B006: Analytics

### Phase 4: Premium Features (Future)
1. GAP-B004: Amazon crosslisting
2. GAP-D008: Multi-marketplace
3. GAP-D018: Competition analysis

---

## Appendix: Data Sources Referenced

1. **SAAS-REQUIREMENTS.md** - Current implementation status, pricing tiers
2. **ARCHITECTURE.md** - System design, sync strategies
3. **EBAY-API-BUSINESS.md** - Rate limits, API capabilities
4. **EBAY-API-TECHNICAL.md** - Endpoint specifications
5. **KEEPA-API-BUSINESS.md** - Token costs, data capabilities
6. **BUSINESS-REQUIREMENTS.md** - Feature prioritization
7. **EBAY-LISTING-REQUIREMENTS.md** - Listing flow requirements
8. **ebay-api.md (lessons)** - Real-world implementation learnings

---

*Document maintained by Business Analyst Agent*  
*Last updated: January 2026*
