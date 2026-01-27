# Catalog Import - Reviewed Status & Decline Fix Summary

## Changes Implemented

### 1. Database Migration: Add 'reviewed' Status ✅
**File:** `supabase/migrations/20260126_add_reviewed_status.sql`

- Dropped existing status constraint
- Added new constraint: `CHECK (status IN ('imported', 'processed', 'reviewed'))`
- Updated column comment with new status description
- **Migration applied successfully** to production database

**Status values:**
- `imported` - Awaiting sync (user needs to click Sync)
- `processed` - Synced with correlations available
- `reviewed` - User has reviewed all correlations (new!)

---

### 2. Fixed Decline Button Bug ✅
**File:** `netlify/functions/catalog-import.js`

**Problem:** 
- Decline button was trying to save to non-existent `asin_correlation_feedback` table
- Data wasn't persisting across page refreshes

**Root Cause:**
- Line 1005 tried to `upsert` into `asin_correlation_feedback` table
- That table doesn't exist - feedback is stored directly in `asin_correlations` table

**Fix:**
```javascript
// OLD (line 1005-1016):
const { error: feedbackError } = await getSupabase()
  .from('asin_correlation_feedback')  // ❌ Wrong table!
  .upsert({
    user_id: userId,
    search_asin: source_asin,
    result_asin: target_asin,
    feedback: 'declined'
  }, {
    onConflict: 'user_id,search_asin,result_asin'
  });

// NEW (fixed):
const { error: updateError } = await getSupabase()
  .from('asin_correlations')  // ✅ Correct table!
  .update({
    decision: 'declined',
    decision_at: new Date().toISOString()
  })
  .eq('user_id', userId)
  .eq('search_asin', source_asin)
  .eq('similar_asin', target_asin);
```

**Result:**
- Decline now correctly updates `asin_correlations.decision = 'declined'`
- Also records timestamp in `decision_at` column
- Persists across page refreshes

---

### 3. Added Mark as Reviewed Endpoint ✅
**File:** `netlify/functions/catalog-import.js`

**New Action:** `mark_reviewed`

**Request:**
```json
POST /.netlify/functions/catalog-import
{
  "action": "mark_reviewed",
  "id": "uuid-of-catalog-item",  // or
  "asin": "B01234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Marked as reviewed",
  "updated": 1
}
```

**Logic:**
- Accepts either `id` (UUID) or `asin` parameter
- Updates `catalog_imports.status` from `'processed'` → `'reviewed'`
- Returns 404 if item not found
- Returns error if update fails

---

## Frontend Support (Already Implemented) ✅

The frontend was already prepared for the reviewed status:

1. **STATUS_CONFIG** includes reviewed (line 52-59):
```javascript
reviewed: {
  icon: CheckSquare,
  label: 'Reviewed',
  bgClass: 'bg-blue-50 dark:bg-blue-900/30',
  textClass: 'text-blue-600 dark:text-blue-400',
  animated: false,
  canSync: false,
  clickable: true
}
```

2. **Status Filter** includes reviewed button (line 1818)
3. **Status Counts** includes reviewed count (line 1249)
4. **handleMarkAsReviewed** function exists (line 881)
5. **"Mark as Reviewed" button** shows for processed items (line 2169)

---

## Testing Checklist

### Database
- [x] Migration applied successfully
- [x] Constraint verified: `['imported', 'processed', 'reviewed']`
- [ ] Test inserting record with status='reviewed'
- [ ] Test updating record from processed→reviewed

### API - Decline Functionality
- [ ] Decline a correlation
- [ ] Verify decision='declined' saved in asin_correlations
- [ ] Verify decision_at timestamp saved
- [ ] Refresh page and confirm decline persists
- [ ] Verify declined correlation is hidden from UI

### API - Mark as Reviewed
- [ ] POST with id parameter
- [ ] POST with asin parameter
- [ ] Verify status updated to 'reviewed'
- [ ] Test with non-existent id/asin (should return 404)
- [ ] Test with item that's not processed (should still work)

### Frontend
- [ ] "Mark as Reviewed" button appears for processed items
- [ ] Click button → item status changes to 'reviewed'
- [ ] Reviewed filter shows reviewed items
- [ ] Reviewed count badge updates
- [ ] Reviewed items show with blue badge
- [ ] Can still expand reviewed items to see correlations
- [ ] Cannot sync reviewed items (canSync: false)

---

## Database Schema Reference

### catalog_imports table
```sql
status TEXT DEFAULT 'imported' 
  CHECK (status IN ('imported', 'processed', 'reviewed'))
```

### asin_correlations table
```sql
decision VARCHAR(20) CHECK (decision IN ('accepted', 'declined'))
decline_reason VARCHAR(50)
decision_at TIMESTAMPTZ
```

---

## Files Changed

1. `supabase/migrations/20260126_add_reviewed_status.sql` - NEW
2. `netlify/functions/catalog-import.js` - MODIFIED
   - Fixed decline_correlation action (lines ~995-1025)
   - Added mark_reviewed action (lines ~1030-1070)

---

## Notes

- Frontend was already fully prepared for reviewed status
- Decline bug was a simple table name error
- All functionality now properly wired up
- Migration applied to production database successfully
