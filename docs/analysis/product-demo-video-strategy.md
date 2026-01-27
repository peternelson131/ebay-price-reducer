# Product Demo Video Strategy for OpSyncPro

## Executive Summary
OpSyncPro has 10+ features across two main hubs (Influencer Central & eBay Central). This analysis catalogs all features, prioritizes them for demo videos, and proposes how Clawdbot can automate demo video creation.

---

## Part 1: Feature Inventory

### Influencer Central (Amazon Influencer Tools)

| Feature | What It Does | Target User | Problem Solved |
|---------|-------------|-------------|----------------|
| **Product CRM** | Track sourced products from discovery → decision → listing. Multi-owner support, custom statuses, decision tracking (sell/keep). | Amazon resellers, product sourcers | Replaces spreadsheet chaos with organized workflow |
| **Social Media Posting** | Schedule/post videos to Instagram, Facebook, YouTube. Manage connected accounts. | Amazon influencers, content creators | Centralized multi-platform posting |
| **Auto-Dubbing Catalog** | Translate videos to other languages using Eleven Labs AI. | Creators targeting international markets | Expand reach without manual dubbing |
| **Upload Task List** | Queue of videos pending upload/processing. | Content creators | Track pending work |
| **ASIN Correlation Finder** | Find similar Amazon products for arbitrage opportunities using Keepa data. | Resellers, arbitrageurs | Discover profitable products to source |
| **ASIN Catalog** | Browse and manage your ASIN library. | All users | Central product database |
| **Catalog Import** | Import ASINs from CSV/Excel, sync correlations, review workflow (Imported→Processed→Reviewed). | Users with existing product lists | Bulk onboarding of products |
| **Inbox** | (Coming Soon) Instagram DM management. | Influencers | Centralized messaging |

### eBay Central (Listing & Pricing Tools)

| Feature | What It Does | Target User | Problem Solved |
|---------|-------------|-------------|----------------|
| **Listings** | View and manage eBay inventory. See current prices, quantities, status. | eBay sellers | Inventory visibility |
| **Price Strategies** | Configure automated price reduction rules (% or $ reductions on schedule). | eBay sellers | Automated competitive pricing |
| **Quick List** | AI-powered listing creation. Generate optimized titles, descriptions, category mappings. | eBay sellers | Fast, SEO-optimized listings |

### Other Features

| Feature | What It Does | Target User | Problem Solved |
|---------|-------------|-------------|----------------|
| **Integrations** | Connect eBay, Instagram, Facebook, YouTube accounts. Manage API keys (Keepa). | All users | Central account management |
| **WhatNot Analysis** | Analyze WhatNot marketplace opportunities. | WhatNot sellers | Market intelligence |

---

## Part 2: Demo Prioritization Matrix

| Feature | User Value | Visual Appeal | Complexity | Demo Priority | Notes |
|---------|-----------|---------------|------------|---------------|-------|
| **Product CRM** | High | High | Medium | ⭐⭐⭐⭐⭐ | Core workflow, very visual |
| **Quick List** | High | High | Simple | ⭐⭐⭐⭐⭐ | AI magic, impressive UX |
| **ASIN Correlation Finder** | High | Medium | Medium | ⭐⭐⭐⭐ | Arbitrage power tool |
| **Price Strategies** | High | Medium | Simple | ⭐⭐⭐⭐ | Key differentiator |
| **Social Media Posting** | High | High | Simple | ⭐⭐⭐⭐ | Multi-platform posting |
| **Catalog Import** | Medium | Medium | Simple | ⭐⭐⭐ | Onboarding feature |
| **Auto-Dubbing** | High | High | Medium | ⭐⭐⭐ | Impressive but niche |
| **Listings** | Medium | Low | Simple | ⭐⭐ | Basic inventory view |
| **Integrations** | Medium | Low | Simple | ⭐⭐ | Setup/config (not exciting) |
| **WhatNot Analysis** | Medium | Medium | Medium | ⭐⭐ | Niche market |

---

## Part 3: Recommended Demo Sequence

### Tier 1: Hero Demos (Must Have)
These should be on the landing page and marketing materials.

1. **Product CRM Overview** (60-90 sec)
   - Show the full workflow: Add product → Set status → Track decision → Multiple owners
   - Highlight: Custom statuses, decision tracking, delivery tracking

2. **Quick List Magic** (45-60 sec)
   - Enter an ASIN → AI generates title/description → One-click list to eBay
   - Highlight: AI optimization, category auto-mapping

3. **Price Strategy Automation** (45-60 sec)
   - Create a strategy → Set schedule → Watch automated reductions
   - Highlight: Set-and-forget pricing

### Tier 2: Feature Demos (Good to Have)
For feature-specific pages or onboarding.

4. **ASIN Correlation Finder** (60 sec)
   - Enter source ASIN → View similar products → See arbitrage potential
   - Highlight: Keepa integration, profit analysis

5. **Social Media Posting** (45 sec)
   - Select video → Choose platforms → Post to multiple accounts
   - Highlight: One-click multi-platform

6. **Catalog Import Workflow** (45 sec)
   - Upload spreadsheet → Sync correlations → Review & approve
   - Highlight: Bulk processing, review workflow

### Tier 3: Deep Dives (Nice to Have)
For documentation or advanced users.

7. **Auto-Dubbing** (60 sec)
8. **Integration Setup** (45 sec)
9. **WhatNot Analysis** (45 sec)

---

## Part 4: Autonomous Demo Video Creation

### Current Capabilities

| Capability | Status | Tool |
|------------|--------|------|
| Browser automation | ✅ Ready | `browser` tool |
| Navigate & click | ✅ Ready | `browser` act/snapshot |
| Take screenshots | ✅ Ready | `browser` screenshot |
| Screen recording | ✅ Ready | `nodes` screen_record |
| Video editing | ⚠️ Limited | ffmpeg (basic) |
| Voiceover/narration | ❌ Not available | Would need TTS service |
| Text overlays | ⚠️ Limited | ffmpeg drawtext |

### Proposed Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  1. SCRIPT PHASE                                                │
│  - Define demo steps (click X, type Y, wait Z)                  │
│  - Write narration text for each step                           │
│  - Estimate timing per step                                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. RECORDING PHASE                                             │
│  - Start screen recording (nodes screen_record)                 │
│  - Execute browser automation steps                             │
│  - Pause at key moments for emphasis                            │
│  - Stop recording                                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. POST-PRODUCTION (if needed)                                 │
│  - Add text overlays with ffmpeg                                │
│  - Trim/join clips                                              │
│  - Add background music (from library)                          │
│  - Export final video                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Prerequisites Needed

1. **Test Account Credentials**
   - Store in `credentials.json` as `opsyncpro.testUser` / `opsyncpro.testPassword`
   - Allows Clawdbot to log in autonomously

2. **Demo Data Setup**
   - Pre-populate test account with sample products, videos, listings
   - Makes demos look realistic vs empty states

3. **Screen Recording Config**
   - Verify Mac mini screen recording permissions
   - Set consistent resolution/viewport

### Demo Script Template

```yaml
demo:
  name: "Product CRM Overview"
  duration: 90  # seconds
  steps:
    - action: navigate
      url: "https://opsyncpro.io/product-crm"
      narration: "Welcome to OpSyncPro's Product CRM"
      pause: 2

    - action: click
      target: "Add Product button"
      narration: "Adding a new product is simple"
      pause: 1

    - action: type
      target: "ASIN field"
      text: "B0EXAMPLE123"
      narration: "Just enter the Amazon ASIN"
      pause: 1.5

    # ... more steps
```

---

## Part 5: Implementation Recommendations

### Option A: Script-Based Demos (Recommended)
**Effort:** Medium | **Quality:** High | **Maintenance:** Low

1. Create demo scripts in YAML/JSON format
2. Build a demo runner that executes scripts + records
3. Store scripts in `demos/` folder
4. Re-run anytime UI changes

**Pros:** Repeatable, maintainable, consistent
**Cons:** Initial setup time, may look robotic

### Option B: Interactive Recording
**Effort:** Low | **Quality:** Medium | **Maintenance:** High

1. Clawdbot walks through feature manually
2. Records screen in real-time
3. Exports raw video

**Pros:** Quick to produce, natural flow
**Cons:** Hard to reproduce exactly, inconsistent timing

### Option C: Hybrid Approach
**Effort:** Medium-High | **Quality:** Highest | **Maintenance:** Medium

1. Script-based automation for actions
2. Manual review/editing afterward
3. Add voiceover separately (Pete or TTS)

**Pros:** Best of both worlds
**Cons:** More steps in pipeline

---

## Open Questions for Decision

1. **Voiceover preference?**
   - A) AI-generated TTS (can automate)
   - B) Pete records voiceover (more personal)
   - C) Text-only with captions (simplest)

2. **Video hosting?**
   - A) YouTube (SEO, embeddable)
   - B) Vimeo (cleaner, professional)
   - C) Direct hosting on site (full control)

3. **Demo data policy?**
   - A) Use real (anonymized) data
   - B) Create fake realistic data
   - C) Use obviously fake/example data

4. **Update frequency?**
   - A) Record once, update only on major changes
   - B) Re-record monthly to stay current
   - C) Live demos embedded (always current but risky)

---

## Next Steps (If Approved)

1. **Store test credentials** → Enables autonomous browser sessions
2. **Set up demo account** → Pre-populate with realistic sample data
3. **Pick first demo** → Recommend: Product CRM (highest value)
4. **Create demo script** → Define steps, timing, narration
5. **Test recording pipeline** → Verify screen recording works
6. **Produce first demo** → Execute, review, iterate

---

*Analysis created: 2026-01-27*
*Status: Ready for Review*
