# eBay Price Reducer - Business Requirements

> Prioritized issue analysis from business perspective  
> Updated: January 2026

---

## Executive Summary

Nine issues identified across three categories. **Three are MVP blockers** that prevent the core value proposition from being delivered. The rest are prioritized by business impact and implementation effort.

| Priority | Count | Status |
|----------|-------|--------|
| 🔴 MVP Blockers | 3 | Must fix before meaningful adoption |
| 🟡 High Value | 3 | Significant impact on user retention |
| 🟢 Nice-to-Have | 3 | Competitive differentiators |

---

## Issue Analysis

---

### 1. No eBay Listing Import

**Business Impact:** 🔴 **HIGH** - MVP Blocker

**The Problem:**  
Users with existing eBay stores (the target market) cannot get their inventory into the system. A seller with 1,000 listings has no path forward except manual entry.

**User Story:**  
> As an existing eBay seller, I want to import my current listings so that I can start using price reduction automation on my inventory without re-entering everything manually.

**Acceptance Criteria:**
- [ ] User can import all active eBay listings in one action
- [ ] Import captures: Title, SKU, current price, quantity, listing ID
- [ ] Import handles 10,000+ listings without timeout
- [ ] Duplicate detection prevents re-importing same listing

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Time to import 1,000 listings | < 5 minutes |
| Import success rate | > 99% |
| User activation rate (after import feature) | > 80% connect + import |

**Technical Note:** Use Inventory API `bulkGetInventoryItem` (25 items/call, 2M calls/day limit = virtually unlimited capacity).

**Classification:** ✅ **MVP** - Without this, the tool has no data to work with.

---

### 2. No Bulk Operations

**Business Impact:** 🔴 **HIGH** - MVP Blocker

**The Problem:**  
Creating one listing at a time is a time-waster for high-volume sellers. Pete specifically identified "busy work" as a pain point. One-by-one operations are exactly the administrative burden he wants eliminated.

**User Story:**  
> As a high-volume seller, I want to create/update multiple listings at once so that I can manage my inventory efficiently without repetitive manual work.

**Acceptance Criteria:**
- [ ] Bulk price reduction: Select multiple listings, apply % or $ reduction
- [ ] Bulk schedule: Set reduction schedules for multiple listings
- [ ] Bulk import: Upload CSV for batch listing creation
- [ ] Select all / filter operations in listing table

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Time to update 100 prices | < 30 seconds |
| Clicks per bulk operation | < 5 |
| User time saved per week | Measurable via usage analytics |

**Technical Note:** Already supported by eBay's `bulkUpdatePriceQuantity` - infrastructure is there, need UI.

**Classification:** ✅ **MVP** - Core value proposition is automation; one-by-one defeats the purpose.

---

### 3. Login Says "Username" but Needs Email

**Business Impact:** 🟡 **MEDIUM** - UX Friction

**The Problem:**  
Users fail on first login attempt, creating negative first impression. For a SaaS tool, first 60 seconds determine if users stay or leave.

**User Story:**  
> As a new user, I want clear login instructions so that I can access the app without confusion or failed attempts.

**Acceptance Criteria:**
- [ ] Login field says "Email" not "Username"
- [ ] Placeholder text shows example: "you@example.com"
- [ ] Error message on failure is helpful: "Please enter your email address"

**Success Metrics:**
| Metric | Target |
|--------|--------|
| First-attempt login success rate | > 95% |
| Support tickets for login issues | 0 per 100 signups |

**Classification:** ✅ **MVP** - 5-minute fix with outsized impact on first impression.

---

### 4. Quick List Allows Creation Without eBay Connected

**Business Impact:** 🟡 **MEDIUM** - UX Friction

**The Problem:**  
Users can attempt to create listings without eBay OAuth connected, leading to confusing failures. This is a "pit of failure" - the UI allows users to fall into an error state.

**User Story:**  
> As a new user, I want to be guided to connect eBay before listing so that I don't waste time filling out forms that will fail.

**Acceptance Criteria:**
- [ ] Quick List button disabled until eBay connected
- [ ] Clear visual indicator: "Connect eBay to start listing"
- [ ] Clicking disabled button shows modal explaining why
- [ ] Progress indicator: "Step 1: Connect eBay ✓ Step 2: Create Listings"

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Users completing eBay OAuth before first listing attempt | > 95% |
| Failed listing attempts due to no connection | 0 |

**Classification:** ✅ **MVP** - Prevents user frustration during critical onboarding.

---

### 5. No Clear Onboarding Flow

**Business Impact:** 🟡 **MEDIUM** - Adoption Barrier

**The Problem:**  
New users land in the app with no guidance. For a tool that requires OAuth + import + configuration, abandonment is high without hand-holding.

**User Story:**  
> As a new user, I want a guided setup process so that I can get value from the tool quickly without guessing what to do next.

**Acceptance Criteria:**
- [ ] Welcome modal on first login
- [ ] Step-by-step checklist: Connect eBay → Import Listings → Set First Reduction
- [ ] Progress persists across sessions
- [ ] Checklist dismissible after completion

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Users completing all onboarding steps | > 70% |
| Time from signup to first price reduction scheduled | < 10 minutes |
| Drop-off at each onboarding step | < 20% per step |

**Classification:** 🟡 **High Priority Post-MVP** - Critical for retention but not blocking core functionality.

---

### 6. No Price History Visualization

**Business Impact:** 🔴 **HIGH** - MVP Blocker

**The Problem:**  
Without seeing price trends, users can't make informed decisions about pricing strategy. They're flying blind. For an arbitrage seller like Pete, historical data drives every decision.

**User Story:**  
> As a seller, I want to see my price history over time so that I can understand what pricing strategies work and adjust accordingly.

**Acceptance Criteria:**
- [ ] Line chart showing price over time for each listing
- [ ] Date range selector: 7/30/90/All days
- [ ] Mark when reductions occurred
- [ ] Show sold items with final price highlighted

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Users viewing price history weekly | > 60% of active users |
| Correlation: history viewers vs. retention | Measure for validation |

**Classification:** ✅ **MVP** - The "reducer" needs to show what it reduced.

---

### 7. No Competitive Pricing Integration

**Business Impact:** 🟢 **LOW** - Competitive Differentiator

**The Problem:**  
Users can't see what competitors charge for similar items. Manual research is time-consuming.

**User Story:**  
> As a seller, I want to see competitor prices so that I can price my items competitively without manual research.

**Acceptance Criteria:**
- [ ] Show lowest/median price for similar listings on eBay
- [ ] Indicate how user's price compares (above/below market)
- [ ] Optional: Suggest competitive price

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Users using competitive pricing feature | > 40% of active users |
| Price adjustments made after viewing competitive data | Track correlation |

**Technical Note:** Browse API has 5K/day limit - cache results, update periodically.

**Classification:** 🟢 **Nice-to-Have** - Adds value but not blocking core use case.

---

### 8. No Sales Velocity Indicators

**Business Impact:** 🟢 **LOW** - Feature Enhancement

**The Problem:**  
Users can't see how fast items sell at different price points. This is advanced analytics for power users.

**User Story:**  
> As a data-driven seller, I want to see sales velocity so that I can optimize my pricing for faster turnover vs. higher margins.

**Acceptance Criteria:**
- [ ] Days on market for each listing
- [ ] Average days to sale for sold items
- [ ] Velocity score or indicator (fast/medium/slow)

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Power users engaging with velocity data | > 30% |
| Impact on pricing decisions | Survey/interview |

**Classification:** 🟢 **Nice-to-Have** - Power user feature, not essential for MVP.

---

### 9. No Profit Margin Calculator

**Business Impact:** 🟢 **LOW** - Feature Enhancement

**The Problem:**  
Users must manually calculate profit after fees. Useful but not core to price reduction.

**User Story:**  
> As a seller, I want to see estimated profit after fees so that I can ensure my prices are profitable.

**Acceptance Criteria:**
- [ ] Input: Cost basis per item
- [ ] Calculate: eBay fees (varies by category), shipping estimate
- [ ] Display: Net profit at current and reduced prices

**Success Metrics:**
| Metric | Target |
|--------|--------|
| Users entering cost basis | > 25% |
| Profit calculator usage | Track feature engagement |

**Classification:** 🟢 **Nice-to-Have** - Helpful but ancillary to core value prop.

---

## Priority Matrix

| Issue | Impact | Effort | ROI | Classification |
|-------|--------|--------|-----|----------------|
| 1. Listing Import | 🔴 High | Medium | ⭐⭐⭐ | MVP |
| 2. Bulk Operations | 🔴 High | Medium | ⭐⭐⭐ | MVP |
| 3. Login Label Fix | 🟡 Medium | Low | ⭐⭐⭐ | MVP |
| 4. Disable Quick List | 🟡 Medium | Low | ⭐⭐⭐ | MVP |
| 5. Onboarding Flow | 🟡 Medium | Medium | ⭐⭐ | Post-MVP |
| 6. Price History | 🔴 High | Medium | ⭐⭐⭐ | MVP |
| 7. Competitive Pricing | 🟢 Low | High | ⭐ | Nice-to-Have |
| 8. Sales Velocity | 🟢 Low | Medium | ⭐ | Nice-to-Have |
| 9. Profit Calculator | 🟢 Low | Low | ⭐ | Nice-to-Have |

---

## Recommended Implementation Order

### Phase 1: MVP Fixes (Week 1-2)
1. ✅ Login label fix (< 1 hour)
2. ✅ Disable Quick List without eBay (< 2 hours)
3. ✅ eBay listing import (2-3 days)
4. ✅ Bulk operations UI (2-3 days)
5. ✅ Price history visualization (2-3 days)

### Phase 2: Retention Features (Week 3-4)
6. Onboarding flow with checklist

### Phase 3: Competitive Features (Future)
7. Competitive pricing integration
8. Sales velocity indicators
9. Profit margin calculator

---

## Business Context

**Target User:** High-volume eBay sellers (like Pete) who:
- Have 100-10,000+ active listings
- Value automation over manual work
- Make data-driven pricing decisions
- Want to eliminate "busy work"

**Core Value Proposition:**  
Automate price reductions to move inventory faster without constant manual intervention.

**MVP Definition:**  
User can connect eBay → import existing listings → see price history → bulk-schedule automatic price reductions.

Without all four capabilities, the tool doesn't deliver its core promise.

---

*Document maintained by Business Analyst Agent*  
*For technical implementation details, see development team docs*
