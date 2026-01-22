# Integrations Page Reorganization Analysis

## Executive Summary
Consolidate all integrations (currently scattered across ApiKeys, Settings, and Account pages) into a single, organized Integrations page with expandable category sections. Group integrations by business function: Marketplace, Influencer, and Social Media.

## Problem Statement
Integrations are currently fragmented across multiple pages:
- **ApiKeys page** (`/api-keys`): Keepa, Eleven Labs, OneDrive
- **Settings page**: eBay OAuth
- **Account page** (Social tab): YouTube OAuth

This makes it difficult for users to find and manage all their connected services in one place.

## Current State

### Existing Integrations by Location

| Integration | Current Location | Type | Auth Method |
|-------------|------------------|------|-------------|
| eBay | Settings.jsx | OAuth | OAuth 2.0 popup |
| Keepa | ApiKeys.jsx | API Key | Manual key entry |
| Eleven Labs | ApiKeys.jsx | API Key | Manual key entry |
| OneDrive | ApiKeys.jsx | OAuth | OAuth 2.0 flow |
| YouTube | Account.jsx (Social tab) | OAuth | OAuth 2.0 flow |

### Proposed Integration Categories

| Category | Integrations | Purpose |
|----------|--------------|---------|
| **Marketplace** | eBay, Keepa | Selling platforms & product data |
| **Influencer** | OneDrive, Eleven Labs | Video storage & content creation |
| **Social Media** | YouTube | Content distribution |

## Proposed Approaches

### Option A: Dedicated Integrations Page with Accordion Sections
**Description:** Create a new `/integrations` page with collapsible accordion sections for each category. Each section expands to show its integrations.

**UI Pattern:**
```
┌─────────────────────────────────────────────┐
│  🔗 Integrations                            │
├─────────────────────────────────────────────┤
│  ▼ Marketplace Integrations                 │
│    ├── eBay          [Connected ✓]         │
│    └── Keepa         [Configured ✓]        │
├─────────────────────────────────────────────┤
│  ► Influencer Integrations                  │
│    (Click to expand)                        │
├─────────────────────────────────────────────┤
│  ► Social Media Integrations                │
│    (Click to expand)                        │
└─────────────────────────────────────────────┘
```

**Pros:**
- Clean, organized view of all integrations
- Categories make logical sense to users
- Expandable sections reduce visual clutter
- Single destination for all connection management
- Easy to add new integrations to appropriate categories

**Cons:**
- Requires moving code from 3 existing pages
- Need to handle OAuth callbacks routing
- Users familiar with current locations may need time to adjust

**Effort:** Medium (M)
**Risk:** Low

---

### Option B: Tabbed Integrations Page (Similar to Current Account Page)
**Description:** Create a new `/integrations` page with horizontal tabs for each category instead of accordion.

**UI Pattern:**
```
┌─────────────────────────────────────────────┐
│  [Marketplace] [Influencer] [Social Media]  │
├─────────────────────────────────────────────┤
│  eBay         [Connected ✓] [Disconnect]    │
│  ─────────────────────────────────────────  │
│  Keepa        [Configured ✓] [Edit Key]     │
└─────────────────────────────────────────────┘
```

**Pros:**
- Familiar pattern (matches Account page)
- Full horizontal space for each category

**Cons:**
- Can only see one category at a time
- More clicks to check all integrations
- Doesn't show quick status overview

**Effort:** Medium (M)
**Risk:** Low

---

### Option C: Card-Based Grid with Expandable Categories
**Description:** Show category cards that expand inline to reveal integrations as connection cards.

**UI Pattern:**
```
┌──────────────────┐  ┌──────────────────┐
│  🛒 Marketplace  │  │  🎬 Influencer   │
│  2/2 connected   │  │  1/2 connected   │
│  [Expand ▼]      │  │  [Expand ▼]      │
└──────────────────┘  └──────────────────┘

Expanded:
┌─────────────────────────────────────────────┐
│  🛒 Marketplace Integrations        [▲]     │
│  ┌─────────────┐  ┌─────────────┐          │
│  │ eBay        │  │ Keepa       │          │
│  │ Connected ✓ │  │ Configured ✓│          │
│  │ [Manage]    │  │ [Edit]      │          │
│  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────┘
```

**Pros:**
- Visual summary of connection status at a glance
- Modern card-based UI
- Responsive design friendly

**Cons:**
- More complex to implement
- May be overkill for current number of integrations
- Takes more vertical space when expanded

**Effort:** Large (L)
**Risk:** Medium

---

## Technical Considerations

### Frontend
- **New component:** `Integrations.jsx` page
- **Shared components:** Reuse existing connection UI components
- **State management:** Each integration manages its own connection state
- **Accordion component:** Can use headless UI or build simple accordion

### Integration Components to Extract/Reuse
| Component | Source | Reusability |
|-----------|--------|-------------|
| eBay connection UI | Settings.jsx | Extract to `<EbayIntegration />` |
| Keepa API key UI | ApiKeys.jsx | Extract to `<KeepaIntegration />` |
| Eleven Labs API key UI | ApiKeys.jsx | Extract to `<ElevenLabsIntegration />` |
| OneDrive connection UI | ApiKeys.jsx | Already componentized `<OneDriveConnection />` |
| YouTube connection UI | Account.jsx | Extract to `<YouTubeIntegration />` |

### Backend
- No backend changes required
- All OAuth callbacks can remain the same (just redirect to `/integrations` instead)

### Navigation
- Add "Integrations" to navbar
- Optionally keep `/api-keys` as redirect to `/integrations`
- Update OAuth callback redirects

### OAuth Callback Updates
| Integration | Current Redirect | New Redirect |
|-------------|------------------|--------------|
| eBay | `/settings` | `/integrations` |
| YouTube | `/account` | `/integrations` |
| OneDrive | `/api-keys` | `/integrations` |

## Dependencies & Prerequisites
- [ ] No blockers - can proceed immediately
- [ ] Consider adding integration status indicators to navbar (nice-to-have)

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OAuth callbacks break | Low | High | Test all OAuth flows after migration |
| User confusion on new location | Low | Low | Add redirects from old pages |
| Component extraction breaks functionality | Low | Medium | Test each integration after extraction |

## Open Questions

1. **Navigation placement:** Should Integrations be a top-level nav item or under a settings dropdown?
   - **Recommendation:** Top-level nav item for discoverability

2. **Default expanded state:** Should all categories start expanded or collapsed?
   - **Recommendation:** Start with all collapsed, but auto-expand if user arrives via OAuth callback

3. **Future integrations:** Any upcoming integrations to plan for?
   - TikTok? Instagram? Other marketplaces?

## Recommendation

**Option A: Accordion Sections** is the best balance of simplicity, usability, and implementation effort.

- Matches your vision of expandable menus
- Clean organization by business function
- Low risk, medium effort
- Easy to extend with future integrations

## Next Steps (if approved)

1. Create `/integrations` route and page shell
2. Build accordion component with category headers
3. Extract integration components from existing pages
4. Wire up all connections to new page
5. Update OAuth callback redirects
6. Add nav link to Integrations
7. Add redirects from old pages
8. QA all OAuth flows

---
*Analysis created: 2026-01-22*
*Status: Draft - Awaiting Review*
