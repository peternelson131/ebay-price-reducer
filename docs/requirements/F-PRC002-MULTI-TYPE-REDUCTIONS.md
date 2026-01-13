# F-PRC002: Multi-Type Price Reduction Support

> **Status:** Draft  
> **Priority:** 🔴 Critical (blocks current feature)  
> **Effort:** 1 day  
> **Author:** Clawd 🦞  
> **Date:** 2026-01-12

---

## Problem Statement

The Strategies UI allows users to create both **percentage** and **dollar** reduction types, but the price reduction engine only implements percentage-based calculations. Users who create dollar-based strategies (e.g., "Reduce by $1.00 every 3 days") see no price changes because the backend ignores the reduction type.

---

## Current State

### Frontend (Working ✅)
- Strategies page has toggle for "Percentage" vs "Dollar"
- Creates records with `reduction_type: 'percentage' | 'dollar'`
- Creates records with `reduction_amount: number`
- Display shows "$X" or "X%" correctly

### Database (Working ✅)
```sql
-- strategies table
reduction_type TEXT CHECK (reduction_type IN ('percentage', 'dollar'))
reduction_amount DECIMAL(10,2)
```

### Backend (Broken ❌)
```javascript
// process-price-reductions.js line 85-100
function calculateNewPrice(listing) {
  const currentPrice = parseFloat(listing.current_price);
  const minimumPrice = parseFloat(listing.minimum_price);
  const reductionPercentage = parseFloat(listing.reduction_percentage || 2); // ← Always percentage!
  
  // Calculate reduction - ONLY percentage logic
  const reductionAmount = currentPrice * (reductionPercentage / 100);
  let newPrice = currentPrice - reductionAmount;
  // ...
}
```

**Issues:**
1. Uses `listing.reduction_percentage` instead of strategy's `reduction_amount`
2. No check for `reduction_type`
3. No JOIN to strategies table (separate issue: F-PRC001)

---

## Requirements

### Functional Requirements

#### FR-1: Support Percentage Reductions
**Given** a listing with strategy `reduction_type = 'percentage'` and `reduction_amount = 5`  
**When** price reduction runs on a $100.00 listing  
**Then** new price = $100.00 - ($100.00 × 5%) = $95.00

#### FR-2: Support Dollar Reductions
**Given** a listing with strategy `reduction_type = 'dollar'` and `reduction_amount = 1.50`  
**When** price reduction runs on a $100.00 listing  
**Then** new price = $100.00 - $1.50 = $98.50

#### FR-3: Respect Minimum Price (Both Types)
**Given** a listing at $10.00 with minimum_price = $9.50  
**And** strategy with `reduction_type = 'dollar'` and `reduction_amount = 1.00`  
**When** price reduction runs  
**Then** new price = $9.50 (not $9.00)

#### FR-4: Handle Missing Strategy Gracefully
**Given** a listing with `enable_auto_reduction = true` but no `strategy_id`  
**When** price reduction runs  
**Then** use listing-level `reduction_percentage` as fallback (existing behavior)

#### FR-5: Round to 2 Decimal Places
**Given** any reduction calculation  
**Then** result is rounded to 2 decimal places (standard currency)

---

### Non-Functional Requirements

#### NFR-1: Backward Compatibility
- Listings without strategies must continue working
- Existing `reduction_percentage` field on listings remains supported as fallback

#### NFR-2: Logging
- Log which reduction type was used in `price_reduction_logs`
- Include: `reduction_type`, `reduction_amount_applied`

---

## Technical Design

### Option A: Minimal Change (Recommended)
Modify `calculateNewPrice()` to accept strategy data and branch on type.

```javascript
/**
 * Calculate new price based on reduction strategy
 * @param {Object} listing - The listing record
 * @param {Object} strategy - The strategy record (optional)
 */
function calculateNewPrice(listing, strategy = null) {
  const currentPrice = parseFloat(listing.current_price);
  const minimumPrice = parseFloat(listing.minimum_price);
  
  // Determine reduction parameters
  let reductionType = 'percentage';
  let reductionValue = parseFloat(listing.reduction_percentage || 2);
  
  if (strategy) {
    reductionType = strategy.reduction_type || 'percentage';
    reductionValue = parseFloat(strategy.reduction_amount);
  }
  
  // Calculate based on type
  let reduction;
  if (reductionType === 'dollar') {
    reduction = reductionValue;
  } else {
    reduction = currentPrice * (reductionValue / 100);
  }
  
  let newPrice = currentPrice - reduction;
  
  // Round to 2 decimal places
  newPrice = Math.round(newPrice * 100) / 100;
  
  // Enforce minimum price
  if (newPrice < minimumPrice) {
    newPrice = minimumPrice;
  }
  
  return {
    newPrice,
    reductionType,
    reductionApplied: Math.min(reduction, currentPrice - minimumPrice)
  };
}
```

### Option B: Full Strategy Integration
Requires F-PRC001 (Strategy JOIN) to be implemented first. Would fetch strategy in the main query.

**Recommendation:** Do Option A now, enhance with Option B when F-PRC001 is done.

---

## Implementation Steps

### Step 1: Update `calculateNewPrice()` Function
- Add `strategy` parameter
- Add type branching logic
- Return object with metadata

### Step 2: Update `processListing()` Function
- Fetch strategy if `listing.strategy_id` exists
- Pass strategy to `calculateNewPrice()`

### Step 3: Update Price Reduction Log
- Add `reduction_type` to log insert
- Add `reduction_amount_applied` (actual $ reduced)

### Step 4: Add Unit Tests
- Test percentage reduction
- Test dollar reduction  
- Test minimum price enforcement for both
- Test fallback when no strategy

---

## Database Changes

### New Columns (Optional Enhancement)
```sql
-- Add to price_reduction_logs for better tracking
ALTER TABLE price_reduction_logs 
ADD COLUMN IF NOT EXISTS reduction_type TEXT,
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES strategies(id);
```

---

## Test Cases

| # | Scenario | Input | Expected Output |
|---|----------|-------|-----------------|
| 1 | Percentage reduction | $50.00, 10%, min $40 | $45.00 |
| 2 | Dollar reduction | $50.00, $3.00, min $40 | $47.00 |
| 3 | Percentage hits minimum | $42.00, 10%, min $40 | $40.00 |
| 4 | Dollar hits minimum | $41.00, $3.00, min $40 | $40.00 |
| 5 | Already at minimum | $40.00, any, min $40 | $40.00 (no change) |
| 6 | No strategy (fallback) | $50.00, listing.reduction_percentage=5% | $47.50 |
| 7 | Dollar > current-min | $41.00, $5.00, min $40 | $40.00 |

---

## Acceptance Criteria

- [ ] Dollar reduction strategies reduce price by fixed amount
- [ ] Percentage reduction strategies reduce price by percentage
- [ ] Minimum price is never breached for either type
- [ ] Listings without strategies use fallback percentage
- [ ] Price reduction logs include reduction type
- [ ] All existing tests pass
- [ ] Manual test: Create $1.00 dollar strategy, verify listing reduces by $1.00

---

## Dependencies

| Dependency | Required? | Notes |
|------------|-----------|-------|
| F-PRC001 (Strategy JOIN) | No | Can work without, using separate fetch |
| Database migration | No | Existing schema supports this |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing percentage reductions | High | Fallback to existing behavior if no strategy |
| Rounding errors accumulate | Low | Always round to 2 decimals |
| Dollar reduction > remaining margin | Medium | Cap reduction at (current - minimum) |

---

## Out of Scope

- Strategy frequency/interval handling (F-PRC001)
- Bulk price update optimization (F-PRC006)
- Competitive pricing (F-PRC005)

---

## Sign-Off

| Role | Name | Date | Approved |
|------|------|------|----------|
| Product Owner | Pete | | ☐ |
| Developer | Clawd 🦞 | 2026-01-12 | ☐ |
