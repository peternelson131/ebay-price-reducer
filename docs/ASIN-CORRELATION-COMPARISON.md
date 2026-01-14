# ASIN Correlation Comparison: n8n vs Supabase

## Test Date: 2026-01-14

## Acceptance Criteria

| Criteria | Target | Status |
|----------|--------|--------|
| **Completeness** | Same count ±10% | ❌ FAIL |
| **Overlap** | ≥80% ASINs in both | ❌ FAIL |
| **Data Quality** | Titles, images populated | ✅ PASS |
| **Source Coverage** | Same data sources | ⚠️ PARTIAL |

## Test Results Summary

| ASIN | Product | Keepa Total | Supabase | Overlap | Grade |
|------|---------|-------------|----------|---------|-------|
| B09V3KXJPB | Apple iPad Air | 117 | 17 | 14.5% | ❌ F |
| B0DMVWYDXR | Okjew Speaker | 17 | 11 | 64.7% | ⚠️ D |
| B07XJ8C8F5 | Amazon Product | 80 | 2 | 2.5% | ❌ F |
| B01IIGVUQA | Ultima Replenisher | 113 | 15 | 13.3% | ❌ F |
| B0DKGCP4YB | Okjew Mini Speaker | 16 | 2 | 12.5% | ❌ F |

**Average Overlap: 21.5%** (Target: ≥80%)

## Root Causes Identified

### 1. Previous Candidate Limit (FIXED)
- Old code had `slice(0, 5)` limit on candidates
- Only 5 products were evaluated by AI
- **Fix deployed:** Now evaluates ALL candidates

### 2. Keepa Query Returns MORE Than n8n Search
- n8n uses `api.keepa.com/search` (text search)
- Supabase uses `api.keepa.com/query` (product finder)
- Query API returns more results (brand+category filter)

### 3. Data Was Synced Before Fix
- Current DB data was synced with old 5-limit code
- Need to re-sync to see improved coverage

## Detailed Comparison: B0DMVWYDXR

```
Keepa provides: 17 ASINs (3 variations + 14 similar)
Supabase has:   11 ASINs
Common:         11 (all Supabase results are valid)
Missing:        6 ASINs not in Supabase

Missing ASINs (need re-sync):
- B0DZXR63LJ, B0DZXRFLK1, B0FFN74Z12
- B0FGCDB6RR, B0FJMBCFKL, B0G64N3RSZ
```

## Recommendations

### Immediate Actions
1. ✅ Remove candidate limits (DONE)
2. 🔄 Re-sync test ASINs to verify fix works
3. 📊 Re-run comparison after re-sync

### Future Improvements
1. Consider adding Keepa Search API alongside Query API
2. Batch process AI evaluations for speed
3. Add periodic re-sync to catch new products

## Next Steps
1. Trigger fresh sync for B0DKGCP4YB via Influencer Central
2. Compare before/after results
3. Verify all Keepa candidates are now evaluated
