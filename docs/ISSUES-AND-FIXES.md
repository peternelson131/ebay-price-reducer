# eBay Price Reducer - Issues & Fixes

> Comprehensive QA assessment - January 12, 2026

## Summary

| Priority | Count | Status |
|----------|-------|--------|
| 🔴 Critical | 1 | ✅ Fixed |
| 🟠 High | 3 | Pending |
| 🟡 Medium | 5 | Pending |
| 🟢 Low | 3 | Pending |

---

## 🔴 Critical Issues

### 1. Data Isolation Bug ✅ FIXED
**Issue:** Users could see other users' listings
**Root Cause:** `ListingsOptimized.jsx` used `localStorage.getItem('supabase.auth.token')` which doesn't exist
**Fix:** Changed to `supabase.auth.getSession()` to get proper JWT
**Deployed:** 2026-01-12

---

## 🟠 High Priority Issues

### 2. Quick List Allows Action Without eBay Connection
**Page:** Quick List (`/auto-list`)
**Issue:** User can fill form and click "Create eBay Listing" without eBay connected. Shows error AFTER clicking.
**Expected:** Button should be disabled OR show warning banner when eBay not connected
**Complexity:** Simple

**Acceptance Criteria:**
- GIVEN user is not connected to eBay
- WHEN they visit Quick List
- THEN they see a banner: "Connect your eBay account to create listings"
- AND the Create button shows "Connect eBay First" (disabled)

---

### 3. Login Label Says "Username" Instead of "Email"
**Page:** Login (`/login`)
**Issue:** Input label says "Username" but expects email address
**Expected:** Label should say "Email"
**Complexity:** Simple

**Acceptance Criteria:**
- GIVEN user visits login page
- WHEN they view the form
- THEN the first field is labeled "Email"
- AND placeholder says "Enter your email"

---

### 4. No eBay Listing Import
**Page:** N/A (missing feature)
**Issue:** Users cannot import existing eBay listings into the system
**Expected:** Ability to pull in active eBay listings
**Complexity:** Complex

**Acceptance Criteria:**
- GIVEN user has connected eBay account
- WHEN they click "Import Listings"
- THEN system fetches active listings from eBay
- AND displays import progress
- AND adds listings to the database

---

## 🟡 Medium Priority Issues

### 5. No "Connect eBay" Prompt on Quick List
**Page:** Quick List
**Issue:** No visual indication that eBay connection is required
**Expected:** Show connection status and CTA
**Complexity:** Simple

---

### 6. Preferences Checkboxes Appear Disabled
**Page:** Account > Preferences
**Issue:** Checkboxes show as disabled/grayed even when just viewing
**Expected:** Should look enabled in view mode, only disable when not editable
**Complexity:** Simple

---

### 7. No "Run Now" for Strategies
**Page:** Strategies
**Issue:** Can create rules but no way to manually trigger them
**Expected:** "Run Now" button to apply strategy immediately
**Complexity:** Medium

---

### 8. No Price History Visualization
**Page:** Listings / Listing Detail
**Issue:** Can't see price changes over time visually
**Expected:** Line chart showing price history
**Complexity:** Medium

---

### 9. No Loading States on Some Actions
**Pages:** Various
**Issue:** Some async operations don't show loading indicators
**Expected:** Consistent loading spinners/skeletons
**Complexity:** Simple

---

## 🟢 Low Priority Issues

### 10. ASIN Placeholder Display
**Page:** Quick List
**Issue:** Placeholder "B01KJEOCDW" shows in label area, not input
**Expected:** Placeholder should be inside input field
**Complexity:** Simple

---

### 11. No Confirmation for Delete Account
**Page:** Account > Data & Privacy
**Issue:** Delete Account button has no confirmation dialog
**Expected:** "Are you sure?" dialog with password confirmation
**Complexity:** Simple

---

### 12. Missing Min Price in Quick List
**Page:** Quick List
**Issue:** No way to set minimum price when creating listing
**Expected:** Optional "Minimum Price" field
**Complexity:** Simple

---

## Prioritized Backlog (Simple → Complex)

### Wave 1: Quick Wins (< 1 hour each)
1. [ ] Fix login label "Username" → "Email"
2. [ ] Add confirmation dialog for Delete Account
3. [ ] Fix ASIN placeholder position
4. [ ] Add loading states to missing areas

### Wave 2: UX Improvements (1-4 hours each)
5. [ ] Disable Quick List button when eBay not connected
6. [ ] Add "Connect eBay" banner on Quick List
7. [ ] Fix Preferences checkbox styling
8. [ ] Add Min Price field to Quick List

### Wave 3: Features (4+ hours each)
9. [ ] Add "Run Now" to strategies
10. [ ] Add price history chart
11. [ ] Implement eBay listing import

---

## Test Matrix

| Feature | Happy Path | Edge Cases | Error Handling |
|---------|------------|------------|----------------|
| Login | ✅ Works | ❓ Wrong password | ❓ Rate limiting |
| Quick List | ✅ Works | ✅ No eBay | ✅ Shows error |
| Strategies | ✅ Create works | ❓ Edit/Delete | ❓ Validation |
| Influencer Central | ✅ Search works | ✅ Not found → Sync | ❓ API errors |
| Account | ✅ View works | ❓ Edit profile | ❓ Password change |

---

*See also:*
- `QA-TEST-CASES.md` - Detailed test cases (from QA Agent)
- `BUSINESS-REQUIREMENTS.md` - Business priorities (from BA Agent)
