# Story 10: Dynamic Condition Validation by Category

## Goal
When user enters an ASIN, automatically determine valid conditions for that product's category and only show those options in the dropdown.

## User Experience
1. User enters ASIN in QuickList
2. On blur/submit, system fetches product title from Keepa
3. System gets suggested category from eBay
4. System looks up valid conditions for that category
5. Condition dropdown only shows valid options
6. User cannot select invalid condition → no errors on submit

## Technical Approach

### Database Change
Add `acceptable_conditions` column to `ebay_category_aspects` table:
```sql
ALTER TABLE ebay_category_aspects 
ADD COLUMN acceptable_conditions TEXT[];
```

### Flow
```
ASIN → Keepa (title) → eBay Category API → Supabase lookup → Filter dropdown
```

### Backend Changes

1. **New endpoint: `validate-asin.js`**
   - Input: ASIN
   - Calls Keepa for title
   - Calls eBay for category suggestion
   - Looks up category in `ebay_category_aspects`
   - Returns: { title, categoryId, categoryName, validConditions, imageUrl }

2. **Update `ebay_category_aspects` table**
   - Add `acceptable_conditions` column
   - Seed common categories with their valid conditions

### Frontend Changes

1. **QuickList.jsx**
   - Add ASIN validation on blur
   - Show loading state while validating
   - Update condition dropdown with valid options
   - Show product title/image as confirmation

## Acceptance Criteria

- [ ] User enters ASIN, conditions dropdown updates automatically
- [ ] Only valid conditions for that category are shown
- [ ] Loading indicator while fetching
- [ ] Product title shown as confirmation
- [ ] Graceful fallback if lookup fails (show all conditions)
- [ ] Works for categories: LEGO, Video Games, Electronics, Books

## Test Cases

| Test | Input | Expected |
|------|-------|----------|
| T1: LEGO product | B01KJEOCDW | Shows: NEW, LIKE_NEW, USED |
| T2: Video Game | B0CXKQP123 | Shows: NEW, LIKE_NEW, VERY_GOOD, GOOD, ACCEPTABLE |
| T3: Invalid ASIN | INVALID123 | Shows all conditions (fallback) |
| T4: Unknown category | New product | Shows all conditions (fallback) |

## Test in Production
After deploy:
1. Go to https://dainty-horse-49c336.netlify.app/auto-list
2. Enter known ASIN (B01KJEOCDW)
3. Verify condition dropdown updates
4. Verify only valid conditions shown
5. Create test listing to confirm end-to-end
