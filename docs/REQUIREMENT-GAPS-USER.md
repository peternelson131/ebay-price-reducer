# User Requirements Gap Analysis
## eBay Price Reducer Application

> Detailed analysis of user-facing gaps from persona, journey, UI/UX, and accessibility perspectives  
> Generated: January 2026

---

## Executive Summary

This document analyzes the eBay Price Reducer frontend from a user requirements perspective, identifying gaps that affect adoption, efficiency, and satisfaction across different seller personas. The analysis covers:

- **3 User Personas** with distinct needs and pain points
- **3 User Journeys** mapped against current implementation
- **32 UI/UX Gaps** identified with priorities
- **14 Accessibility Issues** requiring attention

**Critical Finding:** The app has strong core functionality but lacks the user experience polish needed to support users at scale. Power sellers (500+ listings) face significant friction, while new users lack guided discovery.

---

## 1. User Personas

### 1.1 Small Seller (10-50 listings)
**Profile:** Part-time reseller, uses phone frequently, limited time

| Attribute | Detail |
|-----------|--------|
| **Goal** | Supplement income with minimal time investment |
| **Pain Points** | Manual price adjustments eat into limited time |
| **Tech Comfort** | Basic - wants simple, obvious UI |
| **Session Length** | 5-15 minutes, often mobile |
| **Feature Priority** | Quick listing, simple automation, mobile access |

**Current App Support:** ⚠️ Partial
- ✅ Quick List feature exists for fast listing
- ❌ Mobile experience is functional but not optimized
- ❌ No "set it and forget it" automation presets
- ❌ No quick-start templates for common scenarios

**Gaps Identified:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-S1: No "Smart Defaults" for quick setup | High | One-click strategy templates (Aggressive, Moderate, Conservative) |
| G-S2: No mobile-first dashboard view | High | Create condensed mobile dashboard with key actions |
| G-S3: No notifications summary | Medium | Daily/weekly email digest of price changes made |
| G-S4: Price inputs require too many taps | Medium | Add preset price buttons ($9.99, $14.99, $19.99) |

---

### 1.2 Medium Seller (50-500 listings)
**Profile:** Serious side business or small full-time operation

| Attribute | Detail |
|-----------|--------|
| **Goal** | Maximize inventory turnover and profit margins |
| **Pain Points** | Managing inventory across platforms, tracking what works |
| **Tech Comfort** | Intermediate - willing to learn tools that save time |
| **Session Length** | 30-60 minutes, desktop primary |
| **Feature Priority** | Bulk operations, analytics, category management |

**Current App Support:** ⚠️ Partial
- ✅ Bulk listing import via Auto-List
- ✅ Strategy management exists
- ❌ No analytics/dashboard insights
- ❌ No category-level strategy management
- ❌ Limited filtering/sorting capabilities

**Gaps Identified:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-M1: No analytics dashboard | High | Add charts: sales trends, price reduction impact, inventory age |
| G-M2: Cannot apply strategies by category | High | Category-based strategy assignment |
| G-M3: No profit tracking | High | Cost basis input + profit margin calculation |
| G-M4: Limited search/filter on listings | Medium | Advanced filters: price range, age, strategy, sold status |
| G-M5: No export functionality | Medium | Export listings to CSV with all metadata |
| G-M6: No inventory alerts | Medium | Low stock, slow-moving items, price floor reached alerts |

---

### 1.3 Power Seller (500+ listings)
**Profile:** Full-time operation, multiple revenue streams, data-driven

| Attribute | Detail |
|-----------|--------|
| **Goal** | Optimize entire operation with minimal manual intervention |
| **Pain Points** | Scale - any manual process is multiplied 500x |
| **Tech Comfort** | Advanced - expects professional-grade tools |
| **Session Length** | Throughout day, uses keyboard shortcuts |
| **Feature Priority** | Bulk everything, API access, automation rules |

**Current App Support:** ❌ Limited
- ✅ Pagination handles large listing counts
- ❌ No keyboard shortcuts for power users
- ❌ No bulk strategy assignment
- ❌ No API/webhook integrations
- ❌ Performance degrades with thousands of listings

**Gaps Identified:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-P1: No keyboard navigation | High | j/k navigation, Enter to edit, Esc to cancel |
| G-P2: No bulk strategy assignment | High | Select multiple → Apply strategy |
| G-P3: No saved filters/views | High | Save custom filter sets (e.g., "Stale Inventory >30 days") |
| G-P4: No table column resizing | Medium | Drag-to-resize columns |
| G-P5: No inline editing | Medium | Click to edit price/min price directly in table |
| G-P6: Limited performance at scale | Medium | Virtual scrolling for 1000+ listings |
| G-P7: No batch price updates | High | Select 50 items → Reduce all by 10% |
| G-P8: No undo/redo for batch operations | Medium | Undo last batch action within 5 minutes |

---

## 2. User Journey Analysis

### 2.1 Onboarding Journey (Connect eBay, Add API Keys)

**Current Flow:**
```
Login → Dashboard (empty) → ??? → Account → API Keys → Connect eBay
```

**Friction Points:**
| Step | Issue | Severity |
|------|-------|----------|
| 1 | No welcome/onboarding guidance | 🔴 High |
| 2 | User must discover API Keys page themselves | 🔴 High |
| 3 | Keepa setup has 4-step process buried in collapsible | 🟡 Medium |
| 4 | No validation that setup is complete | 🔴 High |
| 5 | Success state unclear - "what now?" | 🟡 Medium |

**Identified Gaps:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-O1: No onboarding wizard | High | Modal wizard: Welcome → Connect eBay → Add Keepa → Import First Listing |
| G-O2: No setup progress indicator | High | Persistent checklist: "3/4 steps complete" |
| G-O3: No contextual help | Medium | "?" tooltips explaining each field |
| G-O4: Keepa instructions too long | Medium | Collapse to essentials, link to detailed guide |
| G-O5: No "Test Connection" feedback loop | High | Real-time validation with clear success/error states |
| G-O6: First-time user sees empty listing page | High | Show CTA: "Import your first listing" or "Connect eBay to start" |

---

### 2.2 Daily Workflow (Listing Creation, Price Management)

**Current Flow - Price Management:**
```
Listings Page → Find listing → Set min price → Enable price reduction → Select strategy
```

**Current Flow - Listing Creation:**
```
Quick List → Enter ASIN → Set price/qty/condition → Submit → Wait → Success/Fail
```

**Friction Points:**
| Step | Issue | Severity |
|------|-------|----------|
| 1 | Finding specific listing requires scrolling or search | 🟡 Medium |
| 2 | Min price and strategy are separate controls | 🟢 Low |
| 3 | No copy listing functionality | 🟡 Medium |
| 4 | Quick List doesn't show success confirmation persistently | 🟡 Medium |
| 5 | No way to duplicate settings from similar listing | 🟡 Medium |
| 6 | Price reduction toggle requires min price first (good) but error is subtle | 🟡 Medium |

**Identified Gaps:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-D1: No "Recently Modified" quick access | Medium | Show last 5 edited listings at top |
| G-D2: No listing templates | Medium | Save settings as template for future listings |
| G-D3: No bulk quick list | High | Paste multiple ASINs, set same price/strategy for all |
| G-D4: No listing duplication | Medium | "Copy listing" button to create variant |
| G-D5: No draft/queue system | Low | Save work-in-progress listings |
| G-D6: Success toast disappears too fast | Medium | Persist success message, add "View listing" link |
| G-D7: No "What's next" suggestion | Low | After listing created, suggest "Add another" or "Set up automation" |

---

### 2.3 Research Workflow (Amazon→eBay Product Research)

**Current Flow:**
```
Influencer Central → Enter ASIN → Search → View correlations → (no action path)
```

**Friction Points:**
| Step | Issue | Severity |
|------|-------|----------|
| 1 | "Influencer Central" name is confusing | 🟡 Medium |
| 2 | No path from research to listing creation | 🔴 High |
| 3 | Cannot search multiple ASINs at once | 🟡 Medium |
| 4 | Results don't show eBay price comparison | 🟡 Medium |
| 5 | No way to save/bookmark research | 🟢 Low |

**Identified Gaps:**
| Gap | Priority | Recommendation |
|-----|----------|----------------|
| G-R1: Missing "List This Item" button | High | Direct path from correlation result to Quick List |
| G-R2: No batch ASIN research | Medium | Paste multiple ASINs, research all |
| G-R3: No price/margin preview | Medium | Show Amazon price, suggested eBay price, est. profit |
| G-R4: No research history | Low | "Recent searches" sidebar |
| G-R5: Name doesn't reflect function | Medium | Rename to "Product Research" or "ASIN Lookup" |
| G-R6: No integration with listings page | Medium | Show if ASIN already exists in user's inventory |

---

## 3. UI/UX Gaps Summary

### 3.1 Missing Features Users Would Expect

| Gap ID | Feature | Priority | Persona Impact |
|--------|---------|----------|----------------|
| G-UX1 | Dashboard with KPIs | High | All |
| G-UX2 | Price history charts | High | Medium, Power |
| G-UX3 | Undo/Redo for changes | High | All |
| G-UX4 | Bulk select + action toolbar | High | Medium, Power |
| G-UX5 | Activity log/audit trail | Medium | Power |
| G-UX6 | Dark/Light theme toggle | Low | All |
| G-UX7 | Session timeout warning | Medium | All |
| G-UX8 | Auto-save for long forms | Medium | All |
| G-UX9 | Confirmation before destructive actions | High | All |
| G-UX10 | "Are you sure?" for Close Listing | High | All |

### 3.2 Workflow Friction Points

| Gap ID | Friction | Priority | Fix |
|--------|----------|----------|-----|
| G-WF1 | Must scroll to find listing actions | High | Sticky action bar on scroll |
| G-WF2 | Strategy dropdown has no preview | Medium | Show reduction preview on hover |
| G-WF3 | Multiple clicks to enable automation | Medium | One-click "Auto-Reduce" toggle with defaults |
| G-WF4 | Pagination resets on filter change | Low | Preserve page when possible |
| G-WF5 | Search doesn't highlight matches | Low | Highlight search term in results |
| G-WF6 | No clear CTA on empty states | High | "Get started" buttons on empty pages |

### 3.3 Mobile Experience

**Current State:** Responsive but not mobile-optimized

| Gap ID | Issue | Priority | Recommendation |
|--------|-------|----------|----------------|
| G-MOB1 | Table columns too cramped | High | Card-based mobile view (already partially implemented) |
| G-MOB2 | Dropdowns hard to tap | Medium | Larger touch targets (44px minimum) |
| G-MOB3 | No bottom navigation | Medium | Thumb-friendly nav bar for quick access |
| G-MOB4 | Quick List form requires scrolling | Medium | Multi-step wizard instead of long form |
| G-MOB5 | No swipe gestures | Low | Swipe to reveal actions on listing cards |
| G-MOB6 | Strategy modal hard to use | Medium | Full-screen modal on mobile |

### 3.4 Dashboard/Analytics Needs

**Critical Gap:** No analytics dashboard exists

**Recommended Dashboard Components:**

| Component | Priority | Description |
|-----------|----------|-------------|
| Active Listings Counter | High | Total active, by status |
| Revenue Summary | High | This week/month estimated from prices |
| Price Reduction Impact | High | Items reduced, total $ reduced |
| Inventory Age Distribution | Medium | Chart: 0-7, 8-30, 31-90, 90+ days |
| Strategy Performance | Medium | Which strategies are working |
| Quick Actions | High | Import, Create Listing, Sync buttons |
| Recent Activity | Medium | Last 10 price changes, new listings |

---

## 4. Accessibility & Usability

### 4.1 Accessibility Issues

| Issue | WCAG | Severity | Location |
|-------|------|----------|----------|
| A1: Color-only status indicators | 1.4.1 | High | Listings table (green/gray toggles) |
| A2: Missing form labels | 1.3.1 | Medium | Some inputs in filter modal |
| A3: Low contrast text | 1.4.3 | Medium | Tertiary text color |
| A4: No skip navigation link | 2.4.1 | Low | All pages |
| A5: Focus not visible on some elements | 2.4.7 | Medium | Custom buttons |
| A6: Images missing alt text | 1.1.1 | Low | Product images in listings |
| A7: Modal traps focus incorrectly | 2.1.2 | Medium | Strategy creation modal |
| A8: No screen reader announcements | 4.1.3 | Medium | Toast notifications |

### 4.2 Error Handling and Feedback

| Gap | Current State | Recommendation |
|-----|---------------|----------------|
| E1: API errors show raw message | Generic "Failed" messages | User-friendly error with action |
| E2: Form validation inline | Some fields, not all | Consistent inline validation |
| E3: Loading states inconsistent | Some spinners, some not | Skeleton loading throughout |
| E4: Success feedback transient | Toasts disappear quickly | Persist important confirmations |
| E5: No retry mechanism | Errors require refresh | "Try Again" buttons |
| E6: Network offline handling | Crashes or hangs | Offline indicator + queue |

### 4.3 Help/Documentation Needs

| Gap | Priority | Recommendation |
|-----|----------|----------------|
| H1: No in-app help | High | "?" icons with tooltips |
| H2: No feature tour | High | First-time user walkthrough |
| H3: No keyboard shortcut reference | Medium | "?" key shows shortcut list |
| H4: No FAQ/troubleshooting | Medium | Help center link |
| H5: Strategy descriptions unclear | Medium | "Learn more" links explaining each |
| H6: No video tutorials | Low | Embedded how-to videos |

### 4.4 Learning Curve Issues

| Issue | Impact | Mitigation |
|-------|--------|------------|
| L1: Terminology confusion (Strategies vs Rules) | Medium | Consistent naming throughout |
| L2: ASIN format not explained | Low | Show example: "B01ABC1234" |
| L3: Min price relationship to automation unclear | High | Visual explanation/tooltip |
| L4: Keepa vs eBay relationship not explained | Medium | Onboarding education |
| L5: Strategy effects not previewed | Medium | "This will reduce by $X every Y days" |

---

## 5. Priority Summary

### Must Fix for MVP (P0)
1. **G-O1:** Onboarding wizard (user drops off without guidance)
2. **G-O6:** Empty state CTAs (users don't know what to do)
3. **G-UX1:** Dashboard with KPIs (no visibility into inventory health)
4. **G-R1:** Research → Listing path (workflow dead end)
5. **G-P2/G-UX4:** Bulk operations (core value for target users)
6. **A1:** Accessibility - status indicators need text labels

### High Priority Post-MVP (P1)
1. **G-UX2:** Price history visualization
2. **G-M1:** Analytics dashboard
3. **G-P1:** Keyboard navigation
4. **G-MOB1-3:** Mobile optimization
5. **G-D3:** Bulk quick list
6. **E1-E5:** Error handling improvements

### Medium Priority (P2)
1. **G-S1:** Smart defaults/templates
2. **G-M4:** Advanced search/filter
3. **G-P3:** Saved views
4. **G-UX3:** Undo/Redo
5. **H1-H3:** Help system
6. **L1-L5:** Learning curve improvements

### Nice to Have (P3)
1. **G-UX6:** Theme toggle
2. **G-R4:** Research history
3. **G-D5:** Draft system
4. **G-MOB5:** Swipe gestures
5. **H6:** Video tutorials

---

## 6. Quick Wins (Low Effort, High Impact)

| Item | Effort | Impact | Description |
|------|--------|--------|-------------|
| Empty state CTAs | 2h | High | Add "Get started" buttons to empty pages |
| Success toast with link | 1h | Medium | "Listing created - [View on eBay]" |
| Strategy preview on hover | 2h | Medium | Show "Reduces $X every Y days" |
| Min price tooltip | 30m | Medium | Explain why it's required for automation |
| Research → List button | 2h | High | Direct path from ASIN correlation results |
| Mobile card actions | 2h | High | More prominent action buttons on mobile |
| Keyboard shortcuts (basic) | 4h | Medium | j/k navigation, Enter/Esc |
| Loading skeletons | 3h | Medium | Replace spinners with content skeletons |

---

## 7. Recommendations Summary

### For Small Sellers
- Simplify onboarding with wizard
- Add "Quick Setup" presets for strategies
- Improve mobile experience significantly

### For Medium Sellers
- Build analytics dashboard as priority
- Add category-based strategy management
- Enable profit tracking with cost basis input

### For Power Sellers
- Implement keyboard navigation
- Add bulk operations across the board
- Create saved views/filters system
- Consider API access for integrations

### For All Users
- Fix accessibility issues (color indicators, focus states)
- Improve error handling with actionable messages
- Add in-app help system with tooltips
- Create consistent loading/success states

---

*Document generated by User Requirements Analysis Agent*  
*For technical implementation, coordinate with frontend development team*
