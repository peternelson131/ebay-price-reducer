# Catalog Import Feature Enhancements

## Features to Implement

### 1. Multi-select checkboxes + Bulk "Sync Selected"
**Frontend:**
- Add checkbox column to table
- Track selected IDs in state
- Add "Sync Selected" button (disabled when none selected)
- Show count of selected items

**Backend:**
- Already supports `sync` action with array of IDs ✓

**Acceptance Criteria:**
- [ ] Checkbox appears on each row
- [ ] "Select All" checkbox in header
- [ ] "Sync Selected (N)" button shows count
- [ ] Clicking Sync Selected queues all selected items
- [ ] Selection clears after sync

---

### 2. "Sync All" button
**Frontend:**
- Add "Sync All" button next to other action buttons
- Confirmation dialog: "Queue all X imported items for sync?"

**Backend:**
- Add `sync_all` action that queues all `imported` status items

**Acceptance Criteria:**
- [ ] Button visible when there are items with `imported` status
- [ ] Shows confirmation with count
- [ ] All imported items change to `pending` status
- [ ] Works for 1,494+ items

---

### 3. Progress indicator for image fetch
**Frontend:**
- Show progress modal/toast during fetch
- Display: "Fetching images: batch 5/15 (500/1494 ASINs)"

**Backend:**
- Return progress info OR use streaming/polling
- Option: Return estimated batches upfront

**Acceptance Criteria:**
- [ ] Progress visible during fetch operation
- [ ] Shows batch progress (X of Y)
- [ ] Shows completion message with count updated

---

### 5. Improved search
**Frontend:**
- Debounced search input
- Search filters current page AND can search all (server-side)

**Backend:**
- Add `search` query param to list action
- Search ASIN and title fields

**Acceptance Criteria:**
- [ ] Search updates results as you type (debounced)
- [ ] Finds partial matches in ASIN and title
- [ ] Works across all pages (server-side search)

---

### 6. Sort options
**Frontend:**
- Add sort dropdown: Date Imported, Status, Title (A-Z), ASIN
- Toggle ascending/descending

**Backend:**
- Add `sortBy` and `sortOrder` query params

**Acceptance Criteria:**
- [ ] Can sort by date, status, title, ASIN
- [ ] Can toggle asc/desc
- [ ] Sort persists across pagination

---

### 7. Correlation count badge
**Frontend:**
- Show badge with count on row (before expanding)
- e.g., "5 correlations" or badge with number

**Backend:**
- Include correlation_count in list response (already may be there)

**Acceptance Criteria:**
- [ ] Count visible without expanding row
- [ ] Accurate count matches actual correlations
- [ ] Shows "0" or different style if no correlations

---

### 8. Auto-fetch images on import
**Frontend:**
- Add toggle/checkbox in import modal: "Fetch images from Keepa after import"
- If checked, trigger fetch_images after successful import

**Backend:**
- No changes needed (uses existing fetch_images action)

**Acceptance Criteria:**
- [ ] Option visible in import modal
- [ ] Defaults to ON
- [ ] If enabled, images fetched automatically after import
- [ ] Progress shown during fetch

---

### 9. Export results as CSV
**Frontend:**
- Add "Export CSV" button
- Download file with: ASIN, Title, Status, Image URL, Correlations

**Backend:**
- Add `export` action that returns CSV data
- Or frontend can generate from loaded data

**Acceptance Criteria:**
- [ ] Button triggers download
- [ ] CSV includes all relevant columns
- [ ] Filename includes date: `catalog-export-2026-01-16.csv`

---

### 10. Re-import & merge
**Frontend:**
- When importing, show warning if ASINs already exist
- Option: "Update existing" vs "Skip existing"

**Backend:**
- Modify import to support `mode: 'merge'` or `mode: 'skip'`
- Merge updates title, image_url, etc. for existing ASINs

**Acceptance Criteria:**
- [ ] Detects duplicate ASINs during import
- [ ] Shows count of new vs existing
- [ ] "Update existing" updates the records
- [ ] "Skip existing" only adds new ones

---

## Implementation Order

### Phase 1 (Can parallelize)
- Feature 1: Multi-select (Frontend)
- Feature 2: Sync All (Frontend + Backend)
- Feature 6: Sort options (Frontend + Backend)

### Phase 2 (Can parallelize)
- Feature 5: Improved search (Frontend + Backend)
- Feature 7: Correlation count badge (Frontend)
- Feature 9: Export CSV (Frontend)

### Phase 3
- Feature 3: Progress indicator (Frontend + Backend)
- Feature 8: Auto-fetch on import (Frontend)
- Feature 10: Re-import merge (Frontend + Backend)

---

## QA Verification
After each feature:
1. Test in UI with real data (1,494 ASINs)
2. Verify edge cases (empty state, large data, errors)
3. Check mobile responsiveness
4. Confirm no regressions to existing features
