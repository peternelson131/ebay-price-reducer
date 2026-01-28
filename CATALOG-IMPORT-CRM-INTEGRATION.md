# Catalog Import → CRM Integration - Change Summary

**Date:** 2026-01-28  
**Agent:** Backend Agent  
**Environment:** UAT

---

## Overview

Simplified the catalog import flow to auto-create CRM (`sourced_products`) records on import, removing the correlation sync functionality which has been moved to Product CRM.

---

## Changes Made

### 1. Database Migration

**File:** `~/clawd/projects/ebay-price-reducer/migrations/add-source-column-to-sourced-products.sql`

- Added `source` TEXT column to `sourced_products` table
- Added comment documenting the column purpose
- Created index `idx_sourced_products_source` for performance

**Status:** ⚠️ **Migration needs to be applied manually via Supabase SQL Editor**

**To Apply:**
1. Log into Supabase UAT: https://zzbzzpjqmbferplrwesn.supabase.co
2. Navigate to SQL Editor
3. Run the migration SQL file

---

### 2. Modified `netlify/functions/catalog-import.js`

#### Added Functionality

**Auto-Create CRM Records on Import:**
- When ASINs are imported via CSV/JSON → automatically creates `sourced_products` records
- **Duplicate Prevention:** Checks if ASIN already exists in `sourced_products` (skips if exists)
- **Video Detection:** Checks if video exists for ASIN in `product_videos` table
  - If video exists → sets `status_id` to `fdb7c3fe-02c1-45ec-b459-87adf2d56ab2` ("Imported existing video")
  - If no video → `status_id` remains `null`
- **Source Tracking:** All records tagged with `source: 'catalog_import'`
- Populates fields: `user_id`, `asin`, `title`, `image_url`, `amazon_url`, `status_id`, `source`

**Location in code:** Lines ~1045-1110 (after catalog_imports insert)

#### Removed Functionality

**Correlation Sync Features (Disabled):**
- `action=sync` - Removed background job creation and correlation fetching
- `action=sync_all` - Removed bulk sync queueing
- `action=process_pending` - Removed pending item processing
- `action=sync_status` - Removed job polling endpoint
- **Functions Removed:**
  - `keepaFetch()` - Keepa API fetching with gzip decompression
  - `getImageUrl()` - Extract image URL from Keepa product
  - `extractCorrelations()` - Parse Keepa correlation data
  - `processImportItem()` - Process single ASIN via edge function
  - `processUserPendingItems()` - Batch processing for pending items

**Reason:** Correlation finding has been moved to Product CRM workflow

**Response to sync requests:** Returns 400 error with message:
> "Sync functionality has been disabled. Correlation finding is now handled in Product CRM."

#### Updated Documentation

- Updated function header comment to reflect new auto-create CRM functionality
- Added notes about sync functionality removal
- Documented the new import flow

---

### 3. Preserved Functionality

The following actions remain **unchanged** and fully functional:

- ✅ `action=import` - CSV/JSON import with ASIN validation
- ✅ `action=fetch_images` - Fetch missing images from Keepa
- ✅ `action=create_task` - Create influencer task for accepted correlation
- ✅ `action=decline_correlation` - Mark correlation as declined
- ✅ `action=mark_reviewed` - Mark catalog item as reviewed
- ✅ `action=export` - Export catalog to CSV
- ✅ GET endpoint - List catalog items with pagination, search, filters
- ✅ DELETE endpoint - Clear catalog imports

---

## Testing Checklist

Before deploying to production, verify:

- [ ] Migration applied successfully to UAT database
- [ ] Import CSV → creates `sourced_products` records
- [ ] Duplicate ASINs are skipped (no duplicates created)
- [ ] ASINs with existing videos get correct status "Imported existing video"
- [ ] ASINs without videos have `status_id = null`
- [ ] All records have `source = 'catalog_import'`
- [ ] Sync actions return 400 error with appropriate message
- [ ] Existing actions (fetch_images, export, etc.) still work
- [ ] Frontend handles disabled sync gracefully

---

## Database Schema Reference

### `sourced_products` Table (New Column)

```sql
source TEXT -- Values: 'catalog_import', 'manual', 'api', etc.
```

### Status Reference

**"Imported existing video" Status:**
- ID: `fdb7c3fe-02c1-45ec-b459-87adf2d56ab2` (UAT)
- Name: "Imported existing video"
- Color: `#8B5CF6`
- System Status: `true`

---

## Rollback Plan

If issues arise, rollback by:

1. **Code:** Revert `catalog-import.js` to previous version
2. **Database:** The `source` column is non-breaking (nullable), no rollback needed
3. **Frontend:** May need to re-enable sync UI if rolled back

---

## Next Steps

1. ✅ Apply migration to UAT database
2. ✅ Test import functionality in UAT
3. ✅ Verify sourced_products records are created correctly
4. ✅ Update frontend to remove sync UI elements
5. ✅ Deploy to production after UAT validation

---

## Questions?

Contact: **Backend Agent** via Discord Channel `1459402663027278148`
