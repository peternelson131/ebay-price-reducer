# Data Processing Code Review - January 13, 2026

## Issues Found

### 🔴 Critical: N+1 Query Problem in sync-ebay-listings.js

**Location:** `upsertListings()` function (line ~300)

**Problem:**
```javascript
for (const listing of listings) {
  // 1-2 SELECT queries per listing
  const { data } = await supabase.from('listings').select(...).eq('ebay_item_id', ...).single();
  // Then 1 INSERT or UPDATE per listing
}
```

For 200 listings, this makes 400-600 database queries!

**Fix:** Batch fetch all existing listings first, then batch upsert.

---

### 🟡 Medium: Serial Processing in process-price-reductions.js

**Location:** Line ~570

**Problem:**
```javascript
for (const listing of userDueListings) {
  await processListing(accessToken, listing, shouldDryRun);
}
```

Processes listings one at a time. Could parallelize within user batches.

**Fix:** Use `Promise.all()` with concurrency limit.

---

### 🟢 Minor: Repeated Date Object Creation

**Location:** Multiple files

**Problem:**
```javascript
last_sync: new Date().toISOString(),
updated_at: new Date().toISOString()  // Creates 2 Date objects
```

**Fix:** Create timestamp once at start of function.

---

## Optimizations Applied

### 1. Batch Upsert for Sync

Before: ~600 queries for 200 listings
After: ~5 queries total (1 batch select, 1 batch insert, 1 batch update)

### 2. Parallel Processing with Concurrency

Before: Serial processing
After: Process 5 listings in parallel per user

### 3. Single Timestamp

Before: Multiple `new Date()` calls
After: Single timestamp reused

---

## Performance Improvement Estimate

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| DB Queries (200 listings) | ~600 | ~5 | 99% fewer |
| Sync time | ~30s | ~5s | 6x faster |
| Price reduction time | ~10s | ~2s | 5x faster |
