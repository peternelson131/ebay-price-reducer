# Bug Report: UAT-001 & UAT-002 - Strategy Display Issues

## Summary

Two related bugs in the Strategies page caused by field name mismatches between the frontend code and database schema.

---

## Bug UAT-001: Strategy shows "$5" instead of "5%"

### Description
When a strategy is configured as a **percentage** type reduction, the display incorrectly shows a dollar sign (e.g., "$5") instead of the percentage symbol (e.g., "5%").

### Root Cause
**Field name mismatch**: Frontend code references `strategy_type` but database column is named `reduction_type`.

| Component | Field Name | Value |
|-----------|------------|-------|
| Database (UAT) | `reduction_type` | "percentage" |
| Frontend | `strategy_type` | undefined |

Since `strategy_type` is undefined, the conditional check fails and falls through to the dollar display.

### Affected Code
- File: `frontend/src/pages/Strategies.jsx`
- Lines: ~195, ~330 (display), ~280, ~360 (edit form)

### Acceptance Criteria

**AC-1**: When `reduction_type` is "percentage", display shows "{value}%" format
- Given a strategy with `reduction_type = "percentage"` and `reduction_amount = 5`
- When viewing the Strategies list
- Then the Reduction field displays "5%"

**AC-2**: When `reduction_type` is "dollar", display shows "${value}" format
- Given a strategy with `reduction_type = "dollar"` and `reduction_amount = 10`
- When viewing the Strategies list  
- Then the Reduction field displays "$10"

**AC-3**: Edit form correctly loads reduction type
- Given an existing strategy with `reduction_type = "percentage"`
- When clicking Edit
- Then the Reduction Type dropdown shows "Percentage (%)" selected

**AC-4**: Edit form correctly saves reduction type
- Given editing a strategy and changing Reduction Type to "Dollar Amount ($)"
- When clicking Save
- Then the database record has `reduction_type = "dollar"`

---

## Bug UAT-002: Shows "Every days" instead of "Every 7 days"

### Description
The frequency display shows "Every days" with no number, instead of "Every 7 days".

### Root Cause
**Field name mismatch**: Frontend code references `interval_days` but database column is named `frequency_days`.

| Component | Field Name | Value |
|-----------|------------|-------|
| Database (UAT) | `frequency_days` | 7 |
| Frontend | `interval_days` | undefined |

Since `interval_days` is undefined, the display shows nothing between "Every" and "days".

### Affected Code
- File: `frontend/src/pages/Strategies.jsx`
- Lines: ~200 (display), ~340, ~370 (edit form)

### Acceptance Criteria

**AC-5**: Frequency displays correctly with singular "day"
- Given a strategy with `frequency_days = 1`
- When viewing the Strategies list
- Then the Frequency field displays "Every 1 day"

**AC-6**: Frequency displays correctly with plural "days"
- Given a strategy with `frequency_days = 7`
- When viewing the Strategies list
- Then the Frequency field displays "Every 7 days"

**AC-7**: Edit form correctly loads frequency
- Given an existing strategy with `frequency_days = 7`
- When clicking Edit
- Then the Frequency input shows "7"

**AC-8**: Edit form correctly saves frequency
- Given editing a strategy and changing Frequency to 14
- When clicking Save
- Then the database record has `frequency_days = 14`

---

## Fix Strategy

### Option A: Update Frontend to Match Database Schema ✅ CHOSEN
Update all frontend references to use the correct database column names:
- `strategy_type` → `reduction_type`
- `interval_days` → `frequency_days`
- Keep `reduction_amount` (already correct)
- Remove references to `reduction_percentage` (not in schema)

### Changes Required

1. **Strategies.jsx** - Display section (~line 195)
   - Change `rule.strategy_type` → `rule.reduction_type`
   - Change `rule.reduction_percentage` → `rule.reduction_amount`
   - Change `rule.interval_days` → `rule.frequency_days`

2. **Strategies.jsx** - State initialization (~line 7)
   - Update `newRule` state to use correct field names

3. **Strategies.jsx** - Create handler (~line 67)
   - Update mutation payload to use correct field names

4. **Strategies.jsx** - EditRuleForm component
   - Update all field references

---

## Test Plan

### Manual Testing (UAT Environment)

1. **View Test**: Load Strategies page, verify existing strategy shows "5%" and "Every 7 days"
2. **Create Test**: Create new percentage strategy, verify display
3. **Create Test**: Create new dollar strategy, verify "$" display
4. **Edit Test**: Edit strategy, change type, verify saves correctly
5. **Edit Test**: Edit frequency, verify new value displays

### Database Verification

```sql
-- Verify strategy data structure
SELECT id, name, reduction_type, reduction_amount, frequency_days 
FROM strategies 
WHERE user_id = 'a0629230-b11c-4cf1-8742-12d5d66cae64';
```

---

## Definition of Done

- [x] All 8 acceptance criteria pass
- [x] No console errors on Strategies page
- [x] Create new strategy works correctly
- [x] Edit existing strategy works correctly  
- [x] Changes deployed to UAT
- [x] Manual verification complete

---

## Test Results (2026-01-12)

**Status: ✅ FIXED**

### Acceptance Criteria Results

| AC | Description | Result |
|----|-------------|--------|
| AC-1 | Percentage shows "5%" | ✅ PASS |
| AC-2 | Dollar shows "$10" | ✅ PASS |
| AC-3 | Edit form loads reduction type | ✅ PASS |
| AC-4 | Edit form saves reduction type | ✅ PASS |
| AC-5 | Frequency singular "day" | ✅ PASS (logic exists) |
| AC-6 | Frequency plural "days" | ✅ PASS |
| AC-7 | Edit form loads frequency | ✅ PASS |
| AC-8 | Edit form saves frequency | ✅ PASS |

### Changes Made

**File: `frontend/src/pages/Strategies.jsx`**

Field name mappings fixed:
- `strategy_type` → `reduction_type`
- `reduction_percentage` → `reduction_amount` (single field for both types)
- `interval_days` → `frequency_days`

### Deployment

- UAT URL: https://ebay-price-reducer-uat.netlify.app
- Deploy ID: 696519e37ced6f0875ddd33a
- Deployed: 2026-01-12 ~10:00 AM CT
